import { ENV } from '../js/env.js';
import { createHash } from 'node:crypto';
import { REVIEW_FIELDS, sourceIdentity, reviewValue } from '../js/review-model.js';

export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

export function configuration(env = process.env) {
    const secret = env.CARTILLA_SUPABASE_SERVICE_ROLE_KEY;
    const admins = (env.CARTILLA_ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!secret || !admins.length) throw new HttpError(503, 'Falta configurar el acceso administrativo en Vercel.');
    return { url: ENV.SUPABASE_URL, publicKey: ENV.SUPABASE_ANON_KEY, secret, admins };
}

async function request(config, path, options = {}, transport = fetch) {
    const response = await transport(new URL(path, config.url), {
        ...options,
        headers: { 'Accept-Profile': 'cartilla', 'Content-Profile': 'cartilla', apikey: config.secret, Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new HttpError(502, 'No se pudo completar la consulta a Supabase.');
    return response.status === 204 ? null : response.json();
}

export async function authorize(header, config, transport = fetch) {
    if (typeof header !== 'string' || !/^Bearer [^\s]+$/.test(header)) throw new HttpError(401, 'Iniciá sesión para continuar.');
    const response = await transport(new URL('/auth/v1/user', config.url), {
        headers: { apikey: config.publicKey, Authorization: header }, signal: AbortSignal.timeout(10000)
    });
    if (response.status === 401 || response.status === 403) throw new HttpError(401, 'La sesión venció. Ingresá nuevamente.');
    if (!response.ok) throw new HttpError(502, 'No se pudo verificar la sesión.');
    const user = await response.json();
    if (!user.id || user.is_anonymous || !user.email_confirmed_at || !config.admins.includes(user.id)) {
        throw new HttpError(403, 'Este usuario no tiene permiso para administrar la cartilla.');
    }
    return user;
}

export async function listRecords(config, table, select, transport = fetch, filters = {}) {
    const result = [];
    while (true) {
        const params = new URLSearchParams({ ...filters, select, order: 'id.asc', limit: '100', offset: String(result.length) });
        const page = await request(config, `/rest/v1/${table}?${params}`, {}, transport);
        if (!Array.isArray(page)) throw new HttpError(502, 'Respuesta inesperada de la base.');
        if (!page.length) return result;
        result.push(...page);
    }
}

const beforeFields = ['name', 'address', 'phone', 'city', 'categoria_id'];
const editableFields = ['name', 'address', 'phone', 'categoria_id'];
const idPattern = /^\d{1,18}$/;
function validId(value) { return (typeof value === 'string' || Number.isSafeInteger(value)) && idPattern.test(String(value)); }

export function validateUpdate(body) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!object(body) || !validId(body.id) || !object(body.before) || !object(body.changes) ||
        Object.keys(body).some(key => !['id', 'before', 'changes'].includes(key))) throw new HttpError(400, 'Solicitud de actualización inválida.');
    if (Object.keys(body.before).length !== beforeFields.length || beforeFields.some(key => !(key in body.before))) {
        throw new HttpError(400, 'Faltan los datos originales del profesional.');
    }
    const keys = Object.keys(body.changes);
    if (!keys.length || keys.some(key => !editableFields.includes(key))) throw new HttpError(400, 'Seleccioná campos válidos para actualizar.');
    for (const [key, value] of Object.entries(body.before)) {
        if (key === 'categoria_id' ? value !== null && !validId(value) : value !== null && (typeof value !== 'string' || value.length > 2000)) {
            throw new HttpError(400, 'Los datos originales no son válidos.');
        }
    }
    for (const [key, value] of Object.entries(body.changes)) {
        if (key === 'categoria_id' ? !validId(value) : typeof value !== 'string' || !value.trim() || value.length > 2000) {
            throw new HttpError(400, 'Los valores nuevos no son válidos. No se permiten campos vacíos.');
        }
    }
    return body;
}

function equality(value) {
    if (value === null) return 'is.null';
    // Each condition is a separate URLSearchParams value. PostgREST's eq filter
    // expects the raw value, including for numeric IDs; quoted IDs fail to cast.
    return 'eq.' + String(value);
}

export async function applyUpdate(body, config, user, transport = fetch) {
    validateUpdate(body);
    if ('categoria_id' in body.changes) {
        const params = new URLSearchParams({ id: `eq.${body.changes.categoria_id}`, select: 'id' });
        const categories = await request(config, `/rest/v1/categorias?${params}`, {}, transport);
        if (!Array.isArray(categories) || categories.length !== 1) throw new HttpError(400, 'La especialidad seleccionada no existe.');
    }
    // All original values are conditions on the UPDATE itself: a concurrent edit
    // cannot be overwritten between a preliminary SELECT and the PATCH.
    const params = new URLSearchParams({ id: `eq.${body.id}`, select: 'id,name,address,city,phone,categoria_id,categorias(nombre)' });
    for (const field of beforeFields) params.set(field, equality(body.before[field]));
    const updated = await request(config, `/rest/v1/profesionales?${params}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body.changes)
    }, transport);
    if (!Array.isArray(updated) || updated.length !== 1) throw new HttpError(409, 'El profesional cambió desde que lo revisaste. Recargá los datos antes de guardar.');
    const receipt = { at: new Date().toISOString(), actor: user.id, id: body.id, before: body.before, changes: body.changes, after: updated[0] };
    return receipt;
}

export async function rememberDecision(body, config, user, transport = fetch) {
    const allowed = ['action', 'id', 'before', 'source', 'fields'];
    if (!body || Object.keys(body).some(key => !allowed.includes(key)) || body.action !== 'remember' ||
        !Array.isArray(body.fields) || !body.fields.length || body.fields.length > 4 ||
        new Set(body.fields).size !== body.fields.length || body.fields.some(field => !REVIEW_FIELDS.includes(field))) {
        throw new HttpError(400, 'Seleccioná campos válidos para conservar.');
    }
    // Reuse the full original-record validation without performing an update.
    validateUpdate({ id: body.id, before: body.before, changes: { name: 'validation-only' } });
    const source = body.source;
    if (source !== null && (!source || typeof source !== 'object' || Array.isArray(source) ||
        typeof source.name !== 'string' || !source.name.trim() || !sourceIdentity(source) ||
        Object.keys(source).some(key => !REVIEW_FIELDS.includes(key)) ||
        REVIEW_FIELDS.some(field => source[field] != null && (typeof source[field] !== 'string' || source[field].length > 2000)))) {
        throw new HttpError(400, 'Los datos del profesional de origen no son válidos.');
    }
    const params = new URLSearchParams({ id: `eq.${body.id}`, select: 'id,name,address,city,phone,categoria_id,categorias(nombre)' });
    for (const field of beforeFields) params.set(field, equality(body.before[field]));
    const records = await request(config, `/rest/v1/profesionales?${params}`, {}, transport);
    if (!Array.isArray(records) || records.length !== 1) throw new HttpError(409, 'El profesional cambió. Recargá los datos antes de conservar esta decisión.');
    const record = records[0];
    const now = new Date().toISOString();
    const entries = body.fields.map(field => {
        const identity = sourceIdentity(source);
        const current = reviewValue(record, field);
        const found = reviewValue(source, field, true);
        const fingerprint = createHash('sha256').update(JSON.stringify([String(record.id), field, identity, current, found])).digest('hex');
        return { profesional_id: record.id, field, source_identity: identity, current_value: current, source_value: found,
            fingerprint, decided_by: user.id, decided_at: now, revoked_at: null };
    });
    const decisions = await request(config, '/rest/v1/revision_decisiones?on_conflict=fingerprint', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(entries)
    }, transport);
    if (!Array.isArray(decisions) || decisions.length !== entries.length) throw new HttpError(502, 'No se pudo confirmar el guardado de las decisiones.');
    return { decisions };
}

export async function forgetDecision(body, config, transport = fetch) {
    if (!body || body.action !== 'forget' || !validId(body.decisionId) ||
        Object.keys(body).some(key => !['action', 'decisionId'].includes(key))) throw new HttpError(400, 'Decisión inválida.');
    const revokedAt = new Date().toISOString();
    const params = new URLSearchParams({ id: `eq.${body.decisionId}`, revoked_at: 'is.null', select: 'id' });
    await request(config, `/rest/v1/revision_decisiones?${params}`, {
        method: 'PATCH', body: JSON.stringify({ revoked_at: revokedAt })
    }, transport);
    return { decisionId: body.decisionId, revokedAt };
}
