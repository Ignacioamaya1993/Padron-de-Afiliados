export const SOURCE_URL = 'https://cmolavarria.com.ar/listado-de-profesionales/';
import { normalizeText, normalizeProfessionalName, professionalKey, professionalMatch, addressKey, phoneKey } from '../js/comparison-rules.js';

export function normalize(value) {
    return normalizeText(value);
}

export function normalizeName(value) {
    return normalizeProfessionalName(value);
}

function cellText(html) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
        ordm: 'º', deg: '°', Ntilde: 'Ñ', ntilde: 'ñ', aacute: 'á', eacute: 'é',
        iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú' };
    return html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
            if (code.startsWith('#')) {
                const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
                return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
            }
            if (!(code in entities)) throw new Error(`Entidad HTML no reconocida: ${entity}`);
            return entities[code];
        }).replace(/\s+/g, ' ').trim();
}

export function parseDirectory(html) {
    // Fail closed if the source no longer contains the expected four-column table.
    const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
    for (const [table] of tables) {
        const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match =>
            [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => cellText(cell[1])));
        const headerIndex = rows.findIndex(row => row.map(normalize).join('|') === 'APELLIDO Y NOMBRE|ESPECIALIDAD|DOMICILIO|TELEFONO');
        if (headerIndex === -1) continue;
        const records = rows.slice(headerIndex + 1).filter(row => row.some(Boolean)).map(row => {
            if (row.length !== 4 || !row[0]) throw new Error('Fila inesperada en el listado de origen');
            return { name: row[0], specialty: row[1], address: row[2], phone: row[3] };
        });
        if (!records.length) throw new Error('El listado de origen esta vacio');
        return records;
    }
    throw new Error('No se encontro la tabla esperada; revisar el formato del sitio de origen');
}

export function describeSource(response, html) {
    const text = value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);
    const title = text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const blocked = /just a moment|access denied|attention required|verify you are human|captcha|checking your browser|enable javascript and cookies/i.test(title + ' ' + html.slice(0, 15000));
    return {
        url: response.url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        characters: html.length,
        title,
        tableCount: [...html.matchAll(/<table\b/gi)].length,
        headers: [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].slice(0, 20).map(match => text(match[1])),
        possibleAccessChallenge: blocked,
        explanation: blocked ? 'El sitio parece haber enviado una verificación o bloqueo de acceso. No se intenta eludirla.' :
            'Comparar título y encabezados con la página esperada; HTTP 200 no garantiza que se haya recibido el listado.'
    };
}

function differences(current, source) {
    return ['address', 'phone'].filter(field => {
        // A missing source value never proposes erasing an existing contact detail.
        if (!String(source[field] || '').trim()) return false;
        const key = field === 'address' ? addressKey : phoneKey;
        return key(current[field]) !== key(source[field]);
    }).map(field => ({ field, current: current[field] || '', found: source[field] }));
}

export function compareDirectories(current, external) {
    const currentCounts = new Map();
    for (const record of current) {
        const key = professionalKey(record.name, record.categorias?.nombre);
        currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
    }
    return current.flatMap((record, position) => {
        const key = professionalKey(record.name, record.categorias?.nombre);
        const matches = external.map(candidate => ({ candidate, type: professionalMatch(record, candidate) })).filter(item => item.type);
        matches.sort((a, b) => Number(b.type === 'exact') - Number(a.type === 'exact') || a.candidate.name.localeCompare(b.candidate.name, 'es'));
        const candidates = matches.map(item => item.candidate);
        if (!candidates.length) return [];
        const base = { row: position + 1, current: record };
        if (candidates.length === 1 && currentCounts.get(key) === 1) {
            const changes = differences(record, candidates[0]);
            const missingFields = ['address', 'phone'].filter(field => !String(candidates[0][field] || '').trim());
            return { ...base, status: matches[0].type === 'possible' ? 'posible_coincidencia' : changes.length ? 'diferencias' : missingFields.length ? 'origen_incompleto' : 'sin_diferencias',
                candidates, changes, missingFields };
        }
        return { ...base, status: 'ambiguo', candidates, changes: [] };
    });
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function renderReport(report) {
    const labels = { diferencias: 'Diferencias para revisar', ambiguo: 'Nombre duplicado: revisar identidad',
        posible_coincidencia: 'Posible coincidencia: confirmar identidad', no_encontrado: 'No encontrado en el origen',
        origen_incompleto: 'Origen incompleto', sin_diferencias: 'Sin diferencias detectadas' };
    const e = escapeHtml;
    const cards = report.results.filter(row => row.status !== 'sin_diferencias').map(row => `<article data-status="${e(row.status)}">
        <h2>${e(row.current.name)}</h2><p class="badge">${e(labels[row.status])}</p>
        <p>${e(row.current.categorias?.nombre)} · ${e(row.current.city)}</p>
        <table><thead><tr><th>Dato</th><th>Tu cartilla</th><th>Listado del Círculo Médico</th></tr></thead><tbody>
        <tr><th>Nombre</th><td>${e(row.current.name)}</td><td>${row.candidates.map(item => e(item.name)).join('<hr>') || '—'}</td></tr>
        <tr><th>Especialidad</th><td>${e(row.current.categorias?.nombre)}</td><td>${row.candidates.map(item => e(item.specialty)).join('<hr>') || '—'}</td></tr>
        ${['address', 'phone'].map(field => `<tr><th>${field === 'address' ? 'Dirección' : 'Teléfono'}</th><td>${e(row.current[field]) || '—'}</td><td>${row.candidates.map(item => e(item[field]) || 'Sin dato publicado').join('<hr>') || '—'}</td></tr>`).join('')}
        </tbody></table>${row.changes.length ? `<p>Campos distintos: ${row.changes.map(change => change.field === 'address' ? 'dirección' : 'teléfono').join(', ')}.</p>` : ''}
        ${row.missingFields?.length ? '<p>El origen tiene campos vacíos. No se propone borrar información.</p>' : ''}</article>`).join('');
    return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Revisión de la cartilla</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#183449;background:#eef3f6;margin:0}main{max-width:1100px;margin:auto;padding:24px}article,.summary{background:white;padding:22px;margin:18px 0;border-radius:12px;border:1px solid #d7e2e9}h1{line-height:1.2}h2{font-size:20px;margin:0}.badge{color:#805600;font-weight:600}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:10px;text-align:left;border:1px solid #d7e2e9;overflow-wrap:anywhere}thead{background:#e5f3f7}p{overflow-wrap:anywhere}button{font:inherit;padding:8px 12px;margin:4px;cursor:pointer}@media(max-width:600px){main{padding:12px}article{padding:12px}th,td{padding:6px;font-size:12px}}@media print{body{background:white}button{display:none}article{break-inside:avoid}}</style>
    <main><h1>Revisión de la cartilla</h1><p>Generado: ${e(report.generatedAt)} · <a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">Ver listado de origen</a></p>
    <p><strong>Informe para revisión. No se modificó Supabase ni el respaldo JSON.</strong> Una diferencia no confirma que tu dato sea incorrecto. Verificá identidad, consultorio y pertenencia a la cartilla antes de editar.</p>
    <p>Datos de tu cartilla: ${e(report.currentSource)}. ${report.snapshotDate ? `Copia generada: ${e(report.snapshotDate)}.` : ''}</p>
    <div class="summary">${Object.entries(report.counts).map(([status, count]) => `${e(labels[status])}: <strong>${count}</strong>`).join(' · ')}</div>
    <p>La especialidad debe coincidir. Se admiten nombres de pila en otro orden y nombres abreviados compatibles, que se muestran como posibles coincidencias para confirmar identidad. Las direcciones ignoran los marcadores Nº, N° y No. delante del número. La altura, piso y departamento se conservan en la comparación. Los teléfonos con prefijos distintos pueden aparecer como diferencias.</p>
    ${cards || '<p>No hay casos pendientes de revisión.</p>'}</main></html>`;
}
