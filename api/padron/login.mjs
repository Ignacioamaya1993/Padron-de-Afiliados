
import { isIP } from "node:net";

import {
  createLoginService,
  LoginError
} from "../../server/padron/login-service.mjs";

const messages = {
  INVALID_REQUEST:
    "Solicitud de inicio de sesión inválida.",

  INVALID_CREDENTIALS:
    "Usuario o contraseña incorrectos.",

  RATE_LIMITED:
    "Demasiados intentos. Esperá unos minutos e intentá nuevamente.",

  SERVICE_UNAVAILABLE:
    "No se pudo iniciar sesión. Intentá nuevamente.",

  METHOD_NOT_ALLOWED:
    "Método no permitido.",

  FORBIDDEN:
    "Solicitud no permitida."
};

export function createHandler({
  env = process.env,
  transport = fetch
} = {}) {

  return async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    function fail(status, code) {
      return res.status(status).json({
        code,
        message: messages[code]
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(405, "METHOD_NOT_ALLOWED");
    }

    const origin = req.headers.origin;
    const host = req.headers.host;

    if (
      typeof origin !== "string" ||
      typeof host !== "string" ||
      origin !== `https://${host}`
    ) {
      return fail(403, "FORBIDDEN");
    }

    const contentType = req.headers["content-type"];

    if (
      typeof contentType !== "string" ||
      contentType.split(";")[0].trim().toLowerCase()
        !== "application/json"
    ) {
      return fail(400, "INVALID_REQUEST");
    }

    const contentLength = req.headers["content-length"];

    if (
      contentLength !== undefined &&
      (
        typeof contentLength !== "string" ||
        !/^\d+$/.test(contentLength) ||
        Number(contentLength) > 32768
      )
    ) {
      return fail(400, "INVALID_REQUEST");
    }

    let body = req.body;

    try {
      if (typeof body === "string") {
        if (Buffer.byteLength(body, "utf8") > 32768) {
          return fail(400, "INVALID_REQUEST");
        }

        body = JSON.parse(body);
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Buffer.byteLength(JSON.stringify(body), "utf8")
          > 32768
      ) {
        return fail(400, "INVALID_REQUEST");
      }
    } catch {
      return fail(400, "INVALID_REQUEST");
    }

    const ip = req.headers["x-vercel-forwarded-for"];

    if (typeof ip !== "string" || !isIP(ip)) {
      return fail(503, "SERVICE_UNAVAILABLE");
    }

    try {
      const authenticate = createLoginService({
        env,
        transport
      });

      const session = await authenticate({
        identifier: body.identifier,
        password: body.password,
        ip
      });

      return res.status(200).json(session);

    } catch (error) {

      if (error instanceof LoginError) {
        return fail(error.status, error.code);
      }

      return fail(503, "SERVICE_UNAVAILABLE");
    }
  };
}

export default createHandler();
