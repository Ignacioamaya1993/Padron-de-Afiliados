const ADMIN_EMAIL = "ignacioamaya04@gmail.com";
const SUPABASE_URL = "https://vzqduywffrzhcrjtercs.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SWACMtwkxQ58dhDSwFSofA_ZfEe6HIt";

export const CATALOGS = {
  planes: { label: "Planes", fields: ["nombre", "activo"], idType: "uuid" },
  categorias: { label: "Categorías", fields: ["nombre", "activo"], idType: "uuid" },
  parentescos: { label: "Parentescos", fields: ["nombre", "es_titular"], idType: "uuid" },
  localidades: { label: "Localidades", fields: ["nombre"], idType: "uuid" },
  grupo_sanguineo: {
    label: "Grupos sanguíneos",
    fields: ["nombre"],
    idType: "uuid",
    maxNameLength: 3,
    readOnly: true
  },
  tipo_medicamentos: { label: "Tipos de medicamentos", fields: ["nombre"] },
  tipo_material_ortopedico: { label: "Tipos de materiales ortopédicos", fields: ["nombre"] },
  tipo_practicasxreintegro: { label: "Tipos de prácticas por reintegro", fields: ["nombre"] },
  tipoequipo_oxigenoterapia: { label: "Equipos de oxigenoterapia", fields: ["nombre"] },
  tipo_atencion_domiciliaria: { label: "Tipos de atención domiciliaria", fields: ["nombre"] },
  tipo_derivaciones: { label: "Tipos de derivación", fields: ["nombre"] },
  tipo_expediente_discapacidad: { label: "Tipos de expediente de discapacidad", fields: ["nombre"] },
  tipo_internaciones: { label: "Tipos de internación", fields: ["nombre"] },
  lugar_internaciones: { label: "Lugares de internación", fields: ["nombre"] }
};

export class AdminError extends Error {
  constructor(status, code, metadata = {}) {
    super(code);
    this.status = status;
    this.code = code;
    Object.assign(this, metadata);
  }
}

function parseResponseBody(response) {
  return response.text().then(text => {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  });
}

export function createAdminService({ env = process.env, transport = fetch } = {}) {
  const secret = env.PADRON_SUPABASE_SECRET_KEY;

  async function verifyAdmin(accessToken) {
    if (!accessToken || !secret?.startsWith("sb_secret_")) {
      throw new AdminError(503, "SERVICE_UNAVAILABLE");
    }

    let response;
    try {
      response = await transport(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw new AdminError(503, "SERVICE_UNAVAILABLE");
    }

    const user = await parseResponseBody(response);
    if (!response.ok || user?.email?.toLowerCase() !== ADMIN_EMAIL) {
      throw new AdminError(403, "FORBIDDEN");
    }
  }

  async function databaseRequest(path, options = {}) {
    let response;
    try {
      response = await transport(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          "Accept-Profile": "public",
          "Content-Profile": "public",
          ...options.headers
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw new AdminError(503, "SERVICE_UNAVAILABLE");
    }

    const data = await parseResponseBody(response);
    if (!response.ok) {
      const databaseCode = typeof data?.code === "string" ? data.code : "";
      console.error("Admin catalog database request failed", {
        status: response.status,
        code: databaseCode || "unknown"
      });
      if (databaseCode === "23505") throw new AdminError(409, "DUPLICATE_NAME");
      if (databaseCode === "23503") throw new AdminError(409, "IN_USE");
      if (databaseCode === "22001") throw new AdminError(400, "INVALID_NAME_LENGTH");
      if (["22P02", "23502", "23514"].includes(databaseCode)) {
        throw new AdminError(400, "INVALID_VALUES");
      }
      if (databaseCode === "42501") throw new AdminError(503, "DATABASE_PERMISSION");
      throw new AdminError(400, "DATABASE_ERROR", { databaseCode: databaseCode || null });
    }
    return data;
  }

  return async function manage({ accessToken, action, table, id, values }) {
    await verifyAdmin(accessToken);
    const catalog = CATALOGS[table];
    if (!catalog) throw new AdminError(400, "INVALID_CATALOG");

    const fields = catalog.fields;
    if (action === "list") {
      return databaseRequest(`${table}?select=*&order=nombre.asc`);
    }
    if (catalog.readOnly) throw new AdminError(409, "READ_ONLY_CATALOG");

    if (!["create", "update", "delete"].includes(action)) {
      throw new AdminError(400, "INVALID_ACTION");
    }
    if (action !== "create") {
      const validId = catalog.idType === "uuid"
        ? typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
        : Number.isSafeInteger(Number(id)) && Number(id) > 0;
      if (!validId) throw new AdminError(400, "INVALID_ID");
    }

    if (action === "delete") {
      await databaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      return { ok: true };
    }

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new AdminError(400, "INVALID_VALUES");
    }
    const payload = {};
    for (const field of fields) {
      if (field === "nombre") {
        const value = typeof values.nombre === "string" ? values.nombre.trim() : "";
        if (!value) throw new AdminError(400, "INVALID_NAME");
        if (value.length > (catalog.maxNameLength || 120)) {
          throw new AdminError(400, "INVALID_NAME_LENGTH");
        }
        payload.nombre = value;
      } else if (field in values) {
        if (typeof values[field] !== "boolean") throw new AdminError(400, "INVALID_VALUES");
        payload[field] = values[field];
      }
    }

    if (action === "create") {
      await databaseRequest(table, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload)
      });
    } else {
      await databaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload)
      });
    }
    return { ok: true };
  };
}
