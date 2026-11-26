import { ENV } from './env.js';
import { supabase } from './supabase.js';
import { REVIEW_FIELDS, FIELD_LABELS, validateReport, caseKey, findLiveRecord, beforeRecord, proposedValues, buildChanges, rememberedFields, caseRemembered, hasReviewDifferences } from './review-model.js';

const $ = id => document.getElementById(id);
const storageKey = `cartilla-review-v1:${new URL(ENV.SUPABASE_URL).hostname}`;
let professionals = [];
let categories = [];
let reviewDecisions = [];
let report = null;
let activeIndex = null;
let pendingSave = null;
let busy = false;
let sessionGeneration = 0;
let closingSession = null;
let decisions = {};
try { decisions = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Browsing still works without storage. */ }
if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) decisions = {};

const labels = { diferencias: 'Diferencias de contacto', ambiguo: 'Nombre repetido: confirmar identidad',
    posible_coincidencia: 'Posible coincidencia', no_encontrado: 'Sin coincidencia', origen_incompleto: 'Origen incompleto', sin_diferencias: 'Sin diferencias de contacto' };
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function remember() {
    try { localStorage.setItem(storageKey, JSON.stringify(decisions)); }
    catch { message('No se pudieron recordar las decisiones en este navegador. Descargá el historial antes de salir.', true); }
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function button(text, action, className) {
    const node = element('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
}
function sessionEnded() {
    sessionGeneration++;
    professionals = []; categories = []; reviewDecisions = []; pendingSave = null;
    $('workspace').hidden = true; $('loginPanel').hidden = false; $('logout').hidden = true;
    if ($('confirmDialog').open) $('confirmDialog').close();
}
async function closeAuthSession() {
    if (closingSession) return closingSession;

    const submit = $('loginForm').querySelector('button[type="submit"]');
    const wasDisabled = submit.disabled;

    submit.disabled = true;
    sessionEnded();

    closingSession = (async () => {
        const { error } = await supabase.auth.signOut({
            scope: 'local'
        });

        if (error) {
            throw new Error(
                'Se cerró el acceso local, pero no se pudo confirmar la revocación remota.'
            );
        }
    })();

    try {
        await closingSession;
    } finally {
        closingSession = null;
        submit.disabled = wasDisabled;
    }
}

function assertCurrentSession(generation) {
    if (generation !== sessionGeneration || closingSession) {
        throw new Error('La sesión cambió. La respuesta anterior fue descartada.');
    }
}

async function api(options = {}) {
    const generation = sessionGeneration;
    assertCurrentSession(generation);
    const { data: auth, error: authError } =
        await supabase.auth.getSession();

    assertCurrentSession(generation);

    if (authError) {
        throw new Error('No se pudo verificar la sesión. Reintentá más tarde.');
    }

    if (!auth.session?.access_token) {
        sessionEnded();
        throw new Error('Iniciá sesión para continuar.');
    }

    const response = await fetch('/api/cartilla/admin', {
        ...options,
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
            Authorization: `Bearer ${auth.session.access_token}`
        },
        signal: AbortSignal.timeout(60000)
    });

    const data = await response.json().catch(() => ({}));

    assertCurrentSession(generation);

    const authorizationDenied =
        response.status === 401 ||
        (response.status === 403 && (
            (options.method || 'GET') === 'GET' ||
            data.error === 'Este usuario no tiene permiso para administrar la cartilla.'
        ));

    if (authorizationDenied) {
        await closeAuthSession();
    }

    if (!response.ok) {
        throw new Error(data.error || 'No se pudo completar la operación.');
    }

    return data;
}

async function reload() {
    const generation = sessionGeneration;
    const data = await api();

    assertCurrentSession(generation);
    professionals = data.professionals; categories = data.categories.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    reviewDecisions = data.reviewDecisions || [];
    $('workspace').hidden = false; $('loginPanel').hidden = true; $('logout').hidden = false;
    message(`Sesión iniciada: ${data.user.email}. ${professionals.length} registros disponibles.`);
    if (report) render();
}
$('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    const submit = event.submitter ||
        $('loginForm').querySelector('button[type="submit"]');

    if (submit.disabled || closingSession) return;
    submit.disabled = true;

    try {
        message('Verificando acceso…');

        const { data, error } = await supabase.auth.signInWithPassword({
            email: $('email').value.trim(),
            password: $('password').value
        });

        if (error || !data.session) {
            throw new Error('No se pudo iniciar sesión. Revisá el correo y la contraseña.');
        }

        await reload();
    } catch (error) {
        message(error.message, true);
    } finally {
        $('password').value = '';
        submit.disabled = false;
    }
});

$('logout').addEventListener('click', async () => {
    if (busy) return;

    const logoutButton = $('logout');
    logoutButton.disabled = true;

    try {
        await closeAuthSession();
        message('Sesión cerrada.');
    } catch (error) {
        message(error.message, true);
    } finally {
        logoutButton.disabled = false;
    }
});

$('reload').addEventListener('click', async () => {
    if (busy) return;
    $('reload').disabled = true;
    try { await reload(); } catch (error) { message(error.message, true); }
    finally { $('reload').disabled = false; }
});
$('reportFile').addEventListener('change', async event => {
    if (busy) return;
    try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 10000000) throw new Error('El informe supera el tamaño permitido (10 MB).');
        report = validateReport(JSON.parse(await file.text()));
        activeIndex = null;
        $('reportInfo').textContent = `Informe del ${new Date(report.generatedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · ${report.results.length} casos. ${report.snapshotDate ? 'La comparación original utilizó una copia JSON.' : ''}`;
        $('reviewArea').hidden = false;
        render();
    } catch (error) { message(error.message, true); }
});
function decision(row) { return decisions[caseKey(row)] || {}; }
function decisionStatus(row) {
    if (decision(row).status === 'saved') return 'saved';
    return caseRemembered(row, findLiveRecord(row, professionals), reviewDecisions) ? 'kept' : 'pending';
}
async function rememberOnServer(record, candidates, fields) {
    for (const source of candidates.length ? candidates : [null]) {
        const result = await api({ method: 'POST', body: JSON.stringify({ action: 'remember', id: record.id, before: beforeRecord(record), source, fields }) });
        const fingerprints = new Set(result.decisions.map(item => item.fingerprint));
        reviewDecisions = [...reviewDecisions.filter(item => !fingerprints.has(item.fingerprint)), ...result.decisions];
    }
}
async function decisionOperation(action) {
    if (busy) return;
    busy = true; $('caseDetail').inert = true;
    try { await action(); render(); }
    catch (error) { message(error.message, true); render(); }
    finally { busy = false; $('caseDetail').inert = false; }
}
function included(row) {
    const state = decisionStatus(row);
    const filter = $('caseFilter').value;
    if (filter === 'pending' && !hasReviewDifferences(row)) return false;
    if (filter === 'pending' && (state === 'saved' || state === 'kept')) return false;
    if (filter === 'saved' && state !== 'saved') return false;
    if (filter === 'kept' && state !== 'kept') return false;
    const query = $('caseSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return row.current.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
}
function render() {
    if (!report) return;
    const rows = report.results.map((row, index) => ({ row, index })).filter(({ row }) => included(row));
    if (!rows.some(item => item.index === activeIndex)) activeIndex = rows[0]?.index ?? null;
    const reviewable = report.results.filter(hasReviewDifferences);
    const reviewed = reviewable.filter(row => ['saved', 'kept'].includes(decisionStatus(row))).length;
    $('progress').textContent = `${reviewed} de ${reviewable.length} casos con diferencias revisados · ${rows.length} visibles · ${report.results.length - reviewable.length} sin diferencias`;
    $('caseList').replaceChildren();
    for (const { row, index } of rows) {
        const state = decisionStatus(row);
        const node = button(row.current.name, () => { activeIndex = index; render(); }, index === activeIndex ? 'active' : '');
        node.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
        node.append(element('small', state === 'saved' ? '✓ Actualizado' : state === 'kept' ? '✓ Conservar datos actuales' : labels[row.status] || 'Para revisar'));
        $('caseList').append(node);
    }
    const legacy = report.results.filter(row => decision(row).status === 'kept' && !decision(row).synced && decisionStatus(row) !== 'kept');
    $('syncLegacy').hidden = !legacy.length;
    $('syncLegacy').textContent = `Guardar ${legacy.length} decisiones anteriores de este navegador en Supabase`;
    if (activeIndex === null) { $('caseDetail').replaceChildren(element('p', 'No hay casos con estos filtros.', 'empty')); return; }
    renderCase(report.results[activeIndex]);
}
$('caseSearch').addEventListener('input', render);
$('caseFilter').addEventListener('change', render);

function renderCase(row) {
    const panel = $('caseDetail'); panel.replaceChildren();
    const state = decision(row);
    const live = findLiveRecord(row, professionals);
    panel.append(element('h2', row.current.name, 'case-name'), element('p', labels[row.status] || 'Para revisar', 'badge'));
    if (state.status === 'saved') {
        panel.append(element('p', 'Este caso ya fue actualizado desde este navegador. Podés ver los campos guardados en el historial.', 'saved-note'));
        return;
    }
    if (decisionStatus(row) === 'kept') panel.append(element('p', 'Ya revisado: los campos conservados están guardados en Supabase. Solo volverá a pendientes si cambia un dato comparado o si reconsiderás una decisión.', 'saved-note'));
    else if (state.status === 'kept' && !state.synced) panel.append(element('p', 'Este caso se conservó antes solo en este navegador. Confirmá la conservación o sincronizá las decisiones anteriores para guardarla en Supabase.', 'warning'));
    if (!live) panel.append(element('p', 'No se encontró un único registro con los mismos datos del informe. Puede haber cambiado o estar duplicado. Generá una nueva revisión; este caso no se puede guardar.', 'warning'));
    panel.append(element('p', `Localidad: ${row.current.city || 'Sin informar'}. Confirmá que el candidato corresponda al mismo profesional y consultorio.`, 'muted'));
    const candidateLabel = element('label', 'Profesional del listado de origen'); candidateLabel.htmlFor = 'candidate';
    const candidateSelect = element('select'); candidateSelect.id = 'candidate';
    candidateSelect.append(new Option('Elegir coincidencia…', ''));
    row.candidates.forEach((candidate, index) => candidateSelect.add(new Option(`${candidate.name} · ${candidate.specialty || 'Sin especialidad'} · ${candidate.address || 'Sin dirección'}`, String(index))));
    candidateSelect.value = state.candidateIndex != null ? String(state.candidateIndex) : row.candidates.length === 1 ? '0' : '';
    panel.append(candidateLabel, candidateSelect);
    let selectedCandidate = candidateSelect.value === '' ? null : row.candidates[Number(candidateSelect.value)];
    let values = state.values ? { ...state.values } : proposedValues(selectedCandidate, categories);
    let fields = new Set(state.fields || []);
    const tableWrap = element('div', null, 'compare-wrap');
    const table = element('table', null, 'compare');
    const header = element('tr'); ['Actualizar', 'Tu cartilla', 'Valor a guardar'].forEach(label => header.append(element('th', label)));
    const head = element('thead'); head.append(header); table.append(head);
    const tbody = element('tbody'); table.append(tbody); tableWrap.append(table); panel.append(tableWrap);
    const controls = {};
    function storeDraft() {
        decisions[caseKey(row)] = { ...decision(row), status: 'draft', candidateIndex: candidateSelect.value === '' ? null : Number(candidateSelect.value), fields: [...fields], values: { ...values } };
        remember();
    }
    function paintFields() {
        tbody.replaceChildren();
        for (const field of REVIEW_FIELDS) {
            const tr = element('tr'); const labelCell = element('th'); const currentCell = element('td'); const proposedCell = element('td');
            const fieldLabel = element('label', null, 'field-label'); const check = element('input'); check.type = 'checkbox';
            check.id = `field-${field}`; check.checked = fields.has(field); check.disabled = !live || !selectedCandidate;
            fieldLabel.append(check, document.createTextNode(FIELD_LABELS[field])); labelCell.append(fieldLabel);
            currentCell.textContent = (field === 'specialty' ? row.current.categorias?.nombre : row.current[field]) || 'Sin informar';
            const input = element(field === 'specialty' ? 'select' : 'input'); input.setAttribute('aria-label', `Nuevo valor de ${FIELD_LABELS[field].toLowerCase()}`);
            if (field === 'specialty') {
                input.append(new Option('Elegir especialidad existente…', ''));
                categories.forEach(category => input.add(new Option(category.nombre, String(category.id))));
            } else input.type = 'text';
            input.value = values[field] || ''; input.disabled = !live || !selectedCandidate;
            const sourceText = selectedCandidate?.[field];
            proposedCell.append(input, element('span', `Origen: ${sourceText || 'Sin dato publicado'}`, 'source-value'));
            const remembered = row.candidates.length && !selectedCandidate ? null : rememberedFields(live, selectedCandidate, reviewDecisions).get(field);
            if (remembered) {
                proposedCell.append(element('span', '✓ Dato actual conservado', 'remembered-note'));
                const reconsider = button('Volver a revisar este campo', () => decisionOperation(async () => {
                    const result = await api({ method: 'POST', body: JSON.stringify({ action: 'forget', decisionId: remembered.id }) });
                    reviewDecisions = reviewDecisions.filter(item => String(item.id) !== String(result.decisionId));
                    message('La decisión se reabrió. Este campo vuelve a revisión.');
                }), 'field-decision');
                reconsider.dataset.action = 'forget'; reconsider.dataset.field = field;
                proposedCell.append(reconsider);
            } else {
                const keepField = button('Conservar este campo', () => decisionOperation(async () => {
                    if (!live || (!selectedCandidate && row.candidates.length)) throw new Error('Elegí primero la coincidencia del origen.');
                    await rememberOnServer(live, selectedCandidate ? [selectedCandidate] : [], [field]);
                    fields.delete(field); storeDraft();
                    message(`Decisión guardada en Supabase: conservar ${FIELD_LABELS[field].toLowerCase()} mientras los valores sigan iguales.`);
                }), 'field-decision');
                keepField.dataset.action = 'remember'; keepField.dataset.field = field;
                keepField.disabled = !live || (!selectedCandidate && !!row.candidates.length);
                proposedCell.append(keepField);
            }
            check.addEventListener('change', () => { check.checked ? fields.add(field) : fields.delete(field); storeDraft(); });
            input.addEventListener('input', () => { values[field] = input.value; storeDraft(); });
            controls[field] = { check, input }; tr.append(labelCell, currentCell, proposedCell); tbody.append(tr);
        }
    }
    candidateSelect.addEventListener('change', () => {
        selectedCandidate = candidateSelect.value === '' ? null : row.candidates[Number(candidateSelect.value)];
        values = proposedValues(selectedCandidate, categories); fields = new Set(); storeDraft(); paintFields();
    });
    paintFields();
    panel.append(element('p', 'Solo se actualizan los campos marcados. Usá “Conservar este campo” para recordar los valores que no querés reemplazar. Las decisiones se guardan en Supabase.', 'muted'));
    const actions = element('div', null, 'actions');
    const all = button('Marcar todos los valores disponibles', () => {
        fields = new Set(REVIEW_FIELDS.filter(field => String(values[field] || '').trim())); storeDraft(); paintFields();
    }); all.disabled = !live;
    const keep = button(row.candidates.length > 1 ? 'Conservar ante todas las coincidencias' : 'Conservar datos actuales', () => decisionOperation(async () => {
        if (!live) throw new Error('Generá una revisión actualizada antes de conservar este caso.');
        await rememberOnServer(live, row.candidates, REVIEW_FIELDS);
        decisions[caseKey(row)] = { status: 'kept', synced: true, at: new Date().toISOString() }; remember();
        message('Conservación guardada en Supabase. El caso no volverá a pendientes mientras los datos comparados sigan iguales.');
    }));
    keep.disabled = !live;
    const save = button('Revisar cambios seleccionados', () => {
        try {
            if (!live || !selectedCandidate) throw new Error('Primero elegí el profesional del origen.');
            const changes = buildChanges(live, [...fields], values, categories);
            if (!Object.keys(changes).length) throw new Error('No hay cambios seleccionados con valores distintos.');
            pendingSave = { key: caseKey(row), id: live.id, before: beforeRecord(live), changes };
            showConfirmation(live, changes);
        } catch (error) { message(error.message, true); }
    }, 'primary'); save.disabled = !live;
    actions.append(all, keep, save); panel.append(actions);
}

function showConfirmation(record, changes) {
    $('confirmContent').replaceChildren(element('p', record.name));
    const table = element('table'); const head = element('tr'); ['Campo', 'Actual', 'Nuevo'].forEach(text => head.append(element('th', text))); table.append(head);
    for (const [field, value] of Object.entries(changes)) {
        const row = element('tr'); const category = field === 'categoria_id';
        row.append(element('th', FIELD_LABELS[category ? 'specialty' : field]),
            element('td', category ? record.categorias?.nombre : record[field] || 'Sin informar'),
            element('td', category ? categories.find(item => String(item.id) === String(value))?.nombre : value));
        table.append(row);
    }
    $('confirmContent').append(table); $('saveError').textContent = ''; $('confirmDialog').showModal();
}
$('cancelSave').addEventListener('click', () => { pendingSave = null; $('confirmDialog').close(); });
$('confirmDialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); else pendingSave = null; });
$('confirmSave').addEventListener('click', async () => {
    if (!pendingSave || busy) return;
    busy = true; $('confirmSave').disabled = true; $('cancelSave').disabled = true;
    const selected = pendingSave;
    try {
        const { key, ...body } = selected;
        const receipt = await api({ method: 'POST', body: JSON.stringify(body) });
        decisions[key] = { status: 'saved', receipt }; remember();
        professionals = professionals.map(record => String(record.id) === String(receipt.id) ? receipt.after : record);
        $('confirmDialog').close(); pendingSave = null;
        message('Cambios guardados. La cartilla en línea ya usa los datos nuevos. El respaldo JSON se actualizará con la próxima tarea diaria.');
        render();
    } catch (error) { $('saveError').textContent = error.message; message(error.message, true); }
    finally { busy = false; $('confirmSave').disabled = false; $('cancelSave').disabled = false; }
});
$('downloadHistory').addEventListener('click', () => {
    if (!report) { message('Cargá una revisión antes de descargar el historial.', true); return; }
    const ids = new Set(report.results.map(row => findLiveRecord(row, professionals)?.id).filter(id => id != null).map(String));
    const data = { exportedAt: new Date().toISOString(), reportDate: report.generatedAt,
        conservedFields: reviewDecisions.filter(item => ids.has(String(item.profesional_id))),
        decisions: report.results.map(row => ({ name: row.current.name, ...decision(row) })).filter(row => row.status) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = element('a'); link.href = url; link.download = 'historial-revision.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('syncLegacy').addEventListener('click', () => decisionOperation(async () => {
    let synced = 0; let skipped = 0;
    for (const row of report.results) {
        const old = decision(row);
        if (old.status !== 'kept' || old.synced || decisionStatus(row) === 'kept') continue;
        const record = findLiveRecord(row, professionals);
        if (!record) { skipped++; continue; }
        await rememberOnServer(record, row.candidates, REVIEW_FIELDS);
        decisions[caseKey(row)] = { ...old, synced: true }; remember(); synced++;
    }
    message(`${synced} decisiones anteriores guardadas en Supabase.${skipped ? ` ${skipped} casos necesitan un informe actualizado antes de sincronizarse.` : ''}`);
}));
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
async function initializeAuth() {
    const submit = $('loginForm').querySelector('button[type="submit"]');
    submit.disabled = true;

    try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            throw new Error('No se pudo recuperar la sesión.');
        }

        if (data.session) {
            message('Recuperando sesión…');
            await reload();
        } else {
            sessionEnded();
        }
    } catch (error) {
        sessionEnded();
        message(error.message, true);
    } finally {
        submit.disabled = false;
        document.documentElement.dataset.adminReady = 'true';
    }
}

void initializeAuth();
