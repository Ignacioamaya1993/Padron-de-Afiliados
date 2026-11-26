
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export class LoginError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function createLoginService({
  env = process.env,
  transport = fetch
} = {}) {

  const url = env.PADRON_SUPABASE_URL;
  const secret = env.PADRON_SUPABASE_SECRET_KEY;
  const rateSecret = env.PADRON_LOGIN_RATE_LIMIT_SECRET;

  if (
    url !== "https://vzqduywffrzhcrjtercs.supabase.co" ||
    !secret?.startsWith("sb_secret_") ||
    !/^[a-f0-9]{64}$/i.test(rateSecret || "")
  ) {
    throw new LoginError(503, "SERVICE_UNAVAILABLE");
  }

  function hash(...parts) {
    return createHmac("sha256", Buffer.from(rateSecret, "hex"))
      .update(JSON.stringify(parts))
      .digest("hex");
  }

  async function request(path, body, extraHeaders = {}) {
    let response;

    try {
      response = await transport(`${url}${path}`, {
        method: "POST",
        headers: {
          apikey: secret,
          "Content-Type": "application/json",
          ...extraHeaders
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        cache: "no-store"
      });
    } catch {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    return response;
  }

  async function readJSON(response) {
    try {
      return await response.json();
    } catch {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }
  }

  async function rpc(name, body) {
    const response = await request(
      `/rest/v1/rpc/${name}`,
      body,
      {
        "Accept-Profile": "public",
        "Content-Profile": "public"
      }
    );

    if (!response.ok) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    return readJSON(response);
  }

  return async function authenticate({
    identifier,
    password,
    ip
  }) {

    if (
      typeof identifier !== "string" ||
      typeof password !== "string"
    ) {
      throw new LoginError(400, "INVALID_REQUEST");
    }

    const normalized = identifier.trim().toLowerCase();

    if (
      !normalized ||
      normalized.length > 254 ||
      !password ||
      Buffer.byteLength(password, "utf8") > 4096
    ) {
      throw new LoginError(400, "INVALID_REQUEST");
    }

    if (typeof ip !== "string" || !isIP(ip)) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    const started = Date.now();

    async function invalidCredentials() {
      const remaining = Math.max(
        0, 1500 - (Date.now() - started)
      );

      await new Promise(resolve =>
        setTimeout(resolve, remaining)
      );

      throw new LoginError(401, "INVALID_CREDENTIALS");
    }

    const allowed = await rpc(
      "padron_check_login_attempt",
      {
        p_ip_key: hash("ip", ip),
        p_identifier_key: hash(
          "ip-identifier",
          ip,
          normalized
        )
      }
    );

    if (allowed === false) {
      throw new LoginError(429, "RATE_LIMITED");
    }

    if (allowed !== true) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    const users = await rpc(
      "padron_resolve_login",
      {
        p_identifier: normalized
      }
    );

    if (!Array.isArray(users)) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    if (users.length !== 1) {
      return invalidCredentials();
    }

    const user = users[0];

    if (
      typeof user.email !== "string" ||
      typeof user.auth_user_id !== "string"
    ) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    const response = await request(
      "/auth/v1/token?grant_type=password",
      {
        email: user.email,
        password
      },
      {
        "Sb-Forwarded-For": ip
      }
    );

    if (response.status === 429) {
      throw new LoginError(429, "RATE_LIMITED");
    }

    if (!response.ok) {
      if ([400, 401, 403, 422].includes(response.status)) {
        return invalidCredentials();
      }

      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    const session = await readJSON(response);

    if (
      typeof session.access_token !== "string" ||
      !session.access_token ||
      typeof session.refresh_token !== "string" ||
      !session.refresh_token ||
      session.user?.id !== user.auth_user_id
    ) {
      throw new LoginError(503, "SERVICE_UNAVAILABLE");
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token
    };
  };
}
