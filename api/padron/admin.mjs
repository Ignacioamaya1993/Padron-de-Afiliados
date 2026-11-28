import { isIP } from "node:net";
import { AdminError, createAdminService } from "../../server/padron/admin-service.mjs";
import { isAllowedRequestOrigin } from "../../server/padron/request-origin.mjs";

const messages = {
  FORBIDDEN: "No tenés permiso para administrar estos datos.",
  SERVICE_UNAVAILABLE: "No se pudo validar la sesión con Supabase.",
  INVALID_CATALOG: "Catálogo no permitido.",
  INVALID_ACTION: "Acción no permitida.",
  INVALID_ID: "Registro inválido.",
  INVALID_VALUES: "Datos inválidos.",
  INVALID_NAME: "Ingresá un nombre.",
  INVALID_NAME_LENGTH: "El nombre supera el largo permitido para este catálogo.",
  READ_ONLY_CATALOG: "Este catálogo contiene opciones fijas y no admite cambios.",
  DUPLICATE_NAME: "Ya existe una opción con ese nombre.",
  IN_USE: "Este registro está relacionado con otros datos y no se puede eliminar.",
  DATABASE_PERMISSION: "Supabase rechazó el cambio por permisos. Revisá la clave del servidor.",
  DATABASE_ERROR: "No se pudo guardar el cambio. Revisá si el nombre ya existe."
};

export function createHandler({ env = process.env, transport = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!isAllowedRequestOrigin(origin, host)) {
      return res.status(403).json({ code: "FORBIDDEN", message: messages.FORBIDDEN });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ code: "INVALID_ACTION", message: messages.INVALID_ACTION });
    }

    const contentType = req.headers["content-type"];
    const accessToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const ip = req.headers["x-vercel-forwarded-for"];
    if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("application/json") ||
        !accessToken || (ip && typeof ip === "string" && !isIP(ip))) {
      return res.status(400).json({ code: "INVALID_VALUES", message: messages.INVALID_VALUES });
    }

    let body = req.body;
    try {
      if (typeof body === "string") body = JSON.parse(body);
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Buffer.byteLength(JSON.stringify(body), "utf8") > 8192) throw new Error("invalid");
    } catch {
      return res.status(400).json({ code: "INVALID_VALUES", message: messages.INVALID_VALUES });
    }

    try {
      const manage = createAdminService({ env, transport });
      const result = await manage({ ...body, accessToken });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AdminError) {
        return res.status(error.status).json({
          code: error.code,
          message: messages[error.code] || messages.DATABASE_ERROR,
          ...(error.databaseCode ? { databaseCode: error.databaseCode } : {})
        });
      }
      return res.status(503).json({ code: "SERVICE_UNAVAILABLE", message: messages.SERVICE_UNAVAILABLE });
    }
  };
}

export default createHandler();
