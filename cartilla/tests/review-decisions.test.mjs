import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberDecision, forgetDecision } from '../server/admin-service.mjs';
import { REVIEW_FIELDS, sourceIdentity, reviewValue, rememberedFields, caseRemembered, beforeRecord } from '../js/review-model.js';

const config = { url: 'https://test.supabase.co', secret: 'test-only', publicKey: 'public-only' };
const record = { id: 42, name: 'ALAMO JOSE ALEJANDRO', address: 'ESPAÑA 2727', city: 'Olavarría', phone: '442030', categoria_id: 3, categorias: { nombre: 'CLINICA QUIRURGICA' } };
const source = { name: 'ALAMO ALEJANDRO JOSE', specialty: 'CLINICA QUIRURGICA', address: 'ESPAÑA Nº 2727', phone: '445100' };
const row = { current: record, candidates: [source] };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function entry(field, candidate = source, current = record) {
    return { id: REVIEW_FIELDS.indexOf(field) + 1, profesional_id: current.id, field, source_identity: sourceIdentity(candidate),
        current_value: reviewValue(current, field), source_value: reviewValue(candidate, field, true), revoked_at: null };
}
const body = (fields = REVIEW_FIELDS) => ({ action: 'remember', id: 42, before: beforeRecord(record), source, fields });

test('same decisions suppress repeated reports regardless of date or browser', () => {
    const stored = REVIEW_FIELDS.map(field => entry(field));
    assert.equal(caseRemembered({ ...row, generatedAt: '2027-01-16' }, record, JSON.parse(JSON.stringify(stored))), true);
    assert.equal(caseRemembered(row, record, []), false);
});

test('a source phone change reopens only that field and keeps name/address decisions', () => {
    const stored = REVIEW_FIELDS.map(field => entry(field));
    const changed = { ...source, phone: '999999' };
    const remaining = rememberedFields(record, changed, stored);
    assert.equal(remaining.has('phone'), false);
    assert.equal(remaining.has('name'), true);
    assert.equal(remaining.has('address'), true);
    assert.equal(caseRemembered({ ...row, candidates: [changed] }, record, stored), false);
    assert.equal(rememberedFields(record, { ...source, phone: '' }, stored).has('phone'), false);
});

test('changes to the current data or source identity do not reuse an old decision', () => {
    const stored = REVIEW_FIELDS.map(field => entry(field));
    assert.equal(rememberedFields({ ...record, phone: '888888' }, source, stored).has('phone'), false);
    assert.equal(rememberedFields({ ...record, id: 43 }, source, stored).size, 0);
    assert.equal(rememberedFields(record, { ...source, name: 'OTRA PERSONA' }, stored).size, 0);
    assert.equal(rememberedFields(record, source, stored.map(item => ({ ...item, revoked_at: '2026-11-16' }))).size, 0);
});

test('each alternative must be reviewed; a new candidate is not silently hidden', () => {
    const stored = REVIEW_FIELDS.map(field => entry(field));
    assert.equal(caseRemembered({ ...row, candidates: [source, { ...source, address: 'OTRO CONSULTORIO 100' }] }, record, stored), false);
    const noMatch = REVIEW_FIELDS.map(field => entry(field, null));
    assert.equal(caseRemembered({ ...row, candidates: [] }, record, noMatch), true);
    assert.equal(caseRemembered(row, record, noMatch), false);
});

test('writes only per-field decisions after checking the original professional', async () => {
    const writes = [];
    const transport = async (url, options = {}) => {
        if (url.pathname === '/rest/v1/profesionales') {
            assert.equal(options.method, undefined);
            assert.equal(url.searchParams.get('id'), 'eq.42');
            assert.equal(url.searchParams.get('phone'), 'eq.442030');
            return json([record]);
        }
        assert.equal(url.pathname, '/rest/v1/revision_decisiones');
        assert.equal(url.searchParams.get('on_conflict'), 'fingerprint');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
        const items = JSON.parse(options.body); writes.push(items);
        return json(items.map((item, index) => ({ ...item, id: index + 1 })));
    };
    const first = await rememberDecision(body(['name', 'phone']), config, { id: 'authorized' }, transport);
    await rememberDecision(body(['name', 'phone']), config, { id: 'authorized' }, transport);
    assert.deepEqual(first.decisions.map(item => item.field), ['name', 'phone']);
    assert.equal(first.decisions[0].current_value, record.name);
    assert.equal(first.decisions[0].source_value, source.name);
    assert.equal(first.decisions[0].decided_by, 'authorized');
    assert.equal(writes[0][0].fingerprint, writes[1][0].fingerprint);
    assert.notEqual(writes[0][0].fingerprint, writes[0][1].fingerprint);
    assert.match(writes[0][0].fingerprint, /^[a-f0-9]{64}$/);
});

test('stale original data and invalid fields never create decisions', async () => {
    let writes = 0;
    await assert.rejects(rememberDecision(body(), config, { id: 'authorized' }, async (url, options) => {
        if (options.method) writes++;
        return json([]);
    }), error => error.status === 409);
    for (const invalid of [body([]), body(['city']), body(['phone', 'phone']), { ...body(), source: { name: 'X', unexpected: 'value' } }]) {
        await assert.rejects(rememberDecision(invalid, config, { id: 'authorized' }, async () => { writes++; }), error => error.status === 400);
    }
    assert.equal(writes, 0);
});

test('reconsidering revokes a specific decision without writing professional data', async () => {
    const result = await forgetDecision({ action: 'forget', decisionId: 15 }, config, async (url, options) => {
        assert.equal(url.pathname, '/rest/v1/revision_decisiones');
        assert.equal(url.searchParams.get('id'), 'eq.15');
        assert.equal(url.searchParams.get('revoked_at'), 'is.null');
        assert.equal(options.method, 'PATCH');
        assert(Number.isFinite(Date.parse(JSON.parse(options.body).revoked_at)));
        return new Response(null, { status: 204 });
    });
    assert.equal(result.decisionId, 15);
    await assert.rejects(forgetDecision({ action: 'forget', decisionId: '15&other=1' }, config), error => error.status === 400);
});
