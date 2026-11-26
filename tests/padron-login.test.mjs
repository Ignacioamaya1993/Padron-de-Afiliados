
import test from "node:test";
import assert from "node:assert/strict";

import {
  createLoginService
} from "../server/padron/login-service.mjs";

import {
  createHandler
} from "../api/padron/login.mjs";

const env = {
  PADRON_SUPABASE_URL:
    "https://vzqduywffrzhcrjtercs.supabase.co",
  PADRON_SUPABASE_SECRET_KEY:
    "sb_secret_fake_test_key",
  PADRON_LOGIN_RATE_LIMIT_SECRET:
    "a".repeat(64)
};

const userId = "00000000-0000-4000-8000-000000000001";

const credentials = {
  identifier: "UsuarioPrueba",
  password: "password-ficticio",
  ip: "192.0.2.10"
};

const fakeUser = {
  email: "usuario@example.invalid",
  auth_user_id: userId
};

const fakeSession = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  user: { id: userId }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function setup({
  allowed = true,
  users = [fakeUser],
  authStatus = 200,
  session = fakeSession
} = {}) {

  const calls = [];

  const transport = async (url, options) => {
    calls.push({
      url,
      headers: options.headers,
      body: JSON.parse(options.body)
    });

    if (url.endsWith("/padron_check_login_attempt")) {
      return json(allowed);
    }

    if (url.endsWith("/padron_resolve_login")) {
      return json(users);
    }

    if (url.includes("/auth/v1/token")) {
      return json(session, authStatus);
    }

    throw new Error("Unexpected request");
  };

  return {
    authenticate: createLoginService({ env, transport }),
    transport,
    calls
  };
}

test("01 - Login correcto por username", async () => {
  const { authenticate, calls } = setup();

  const result = await authenticate(credentials);

  assert.deepEqual(result, {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token"
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[1].body.p_identifier,
    "usuarioprueba"
  );
});

test("02 - Login por correo normalizado", async () => {
  const { authenticate, calls } = setup();

  await authenticate({
    ...credentials,
    identifier: " USUARIO@EXAMPLE.INVALID "
  });

  assert.equal(
    calls[1].body.p_identifier,
    "usuario@example.invalid"
  );
});

test("03 - Contadores protegidos mediante HMAC", async () => {
  const { authenticate, calls } = setup();

  await authenticate(credentials);

  const keys = calls[0].body;

  assert.match(keys.p_ip_key, /^[a-f0-9]{64}$/);
  assert.match(keys.p_identifier_key, /^[a-f0-9]{64}$/);

  assert.notEqual(
    keys.p_ip_key,
    keys.p_identifier_key
  );

  assert.ok(
    !JSON.stringify(keys).includes(credentials.ip)
  );

  assert.ok(
    !JSON.stringify(keys).includes("usuarioprueba")
  );
});

test("04 - Límite de intentos alcanzado", async () => {
  const { authenticate, calls } = setup({
    allowed: false
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 429, code: "RATE_LIMITED" }
  );

  assert.equal(calls.length, 1);
});

test("05 - Usuario inexistente", async () => {
  const { authenticate, calls } = setup({
    users: []
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 401, code: "INVALID_CREDENTIALS" }
  );

  assert.equal(calls.length, 2);
});

test("06 - Contraseña incorrecta", async () => {
  const { authenticate } = setup({
    authStatus: 400
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 401, code: "INVALID_CREDENTIALS" }
  );
});

test("07 - Identificador ambiguo", async () => {
  const { authenticate, calls } = setup({
    users: [fakeUser, fakeUser]
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 401, code: "INVALID_CREDENTIALS" }
  );

  assert.equal(calls.length, 2);
});

test("08 - Identificador vacío", async () => {
  const { authenticate, calls } = setup();

  await assert.rejects(
    authenticate({
      ...credentials,
      identifier: " "
    }),
    { status: 400, code: "INVALID_REQUEST" }
  );

  assert.equal(calls.length, 0);
});

test("09 - Contraseña vacía", async () => {
  const { authenticate, calls } = setup();

  await assert.rejects(
    authenticate({
      ...credentials,
      password: ""
    }),
    { status: 400, code: "INVALID_REQUEST" }
  );

  assert.equal(calls.length, 0);
});

test("10 - Contraseña conserva espacios", async () => {
  const { authenticate, calls } = setup();

  await authenticate({
    ...credentials,
    password: " password con espacios "
  });

  assert.equal(
    calls[2].body.password,
    " password con espacios "
  );
});

test("11 - IP inválida", async () => {
  const { authenticate, calls } = setup();

  await assert.rejects(
    authenticate({
      ...credentials,
      ip: "invalid-ip"
    }),
    { status: 503, code: "SERVICE_UNAVAILABLE" }
  );

  assert.equal(calls.length, 0);
});

test("12 - Reenvío de IP a Supabase Auth", async () => {
  const { authenticate, calls } = setup();

  await authenticate(credentials);

  assert.equal(
    calls[2].headers["Sb-Forwarded-For"],
    credentials.ip
  );
});

test("13 - Supabase no disponible", async () => {
  const authenticate = createLoginService({
    env,
    transport: async () => {
      throw new Error("Network error");
    }
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 503, code: "SERVICE_UNAVAILABLE" }
  );
});

test("14 - Configuración incompleta", () => {
  assert.throws(
    () => createLoginService({ env: {} }),
    { status: 503, code: "SERVICE_UNAVAILABLE" }
  );
});

test("15 - Supabase Auth limita solicitudes", async () => {
  const { authenticate } = setup({
    authStatus: 429
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 429, code: "RATE_LIMITED" }
  );
});

test("16 - Identidad autenticada no coincide", async () => {
  const { authenticate } = setup({
    session: {
      ...fakeSession,
      user: { id: "different-user" }
    }
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 503, code: "SERVICE_UNAVAILABLE" }
  );
});

test("17 - Sesión incompleta", async () => {
  const { authenticate } = setup({
    session: {
      ...fakeSession,
      refresh_token: ""
    }
  });

  await assert.rejects(
    authenticate(credentials),
    { status: 503, code: "SERVICE_UNAVAILABLE" }
  );
});

function mockRequest(overrides = {}) {
  return {
    method: "POST",
    headers: {
      host: "preview.example.invalid",
      origin: "https://preview.example.invalid",
      "content-type": "application/json",
      "x-vercel-forwarded-for": credentials.ip
    },
    body: {
      identifier: credentials.identifier,
      password: credentials.password
    },
    ...overrides
  };
}

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,

    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("18 - API devuelve sesión válida", async () => {
  const { transport } = setup();
  const handler = createHandler({ env, transport });
  const res = mockResponse();

  await handler(mockRequest(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");

  assert.deepEqual(res.body, {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token"
  });
});

test("19 - API rechaza método GET", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const res = mockResponse();

  await handler(
    mockRequest({ method: "GET" }),
    res
  );

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST");
  assert.equal(calls.length, 0);
});

test("20 - API rechaza origen externo", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const req = mockRequest();
  const res = mockResponse();

  req.headers.origin = "https://external.example.invalid";

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});

test("21 - API rechaza solicitudes sin origen", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const req = mockRequest();
  const res = mockResponse();

  delete req.headers.origin;

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 0);
});

test("22 - API rechaza contenido no JSON", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const req = mockRequest();
  const res = mockResponse();

  req.headers["content-type"] = "text/plain";

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("23 - API rechaza JSON malformado", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const res = mockResponse();

  await handler(
    mockRequest({ body: "{invalid-json" }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("24 - API rechaza cuerpo demasiado grande", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const res = mockResponse();

  await handler(
    mockRequest({
      body: {
        identifier: "a".repeat(40000),
        password: "test"
      }
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("25 - API no confía en IP alternativa", async () => {
  const { transport, calls } = setup();
  const handler = createHandler({ env, transport });
  const req = mockRequest();
  const res = mockResponse();

  delete req.headers["x-vercel-forwarded-for"];
  req.headers["x-forwarded-for"] = "192.0.2.99";

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(calls.length, 0);
});

test("26 - API no expone detalles internos", async () => {
  const handler = createHandler({
    env,
    transport: async () => {
      throw new Error("Private internal error");
    }
  });

  const res = mockResponse();

  await handler(mockRequest(), res);

  assert.equal(res.statusCode, 503);

  assert.ok(
    !JSON.stringify(res.body).includes(
      "Private internal error"
    )
  );
});

test("27 - API informa límite de intentos", async () => {
  const { transport } = setup({
    allowed: false
  });

  const handler = createHandler({ env, transport });
  const res = mockResponse();

  await handler(mockRequest(), res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "RATE_LIMITED");
});
