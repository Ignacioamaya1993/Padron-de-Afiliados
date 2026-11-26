import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, authorize, validateUpdate, applyUpdate, listRecords } from '../server/admin-service.mjs';
import { proposedValues, buildChanges, beforeRecord, findLiveRecord, validateReport } from '../js/review-model.js';

const config = { url: 'https://test.supabase.co', publicKey: 'public-test', secret: 'private-test', admins: ['authorized-id'] };
const professional = { id: 42, name: 'ALAMO JOSE ALEJANDRO', address: 'ESPAÑA 2727', phone: '442030', city: 'Olavarría', categoria_id: 3, categorias: { nombre: 'CLINICA QUIRURGICA' } };
const candidate = { name: 'ALAMO ALEJANDRO JOSE', address: 'ESPAÑA Nº 2727', phone: '445100', specialty: 'CLINICA QUIRURGICA' };
const categories = [{ id: 3, nombre: 'CLINICA QUIRURGICA' }, { id: 4, nombre: 'CARDIOLOGIA' }];
const body = () => ({ id: 42, before: beforeRecord(professional), changes: { address: candidate.address, phone: candidate.phone } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('the requested partial update changes only address and phone', () => {
    const values = proposedValues(candidate, categories);
    assert.deepEqual(buildChanges(professional, ['address', 'phone'], values, categories), { phone: candidate.phone });
    assert.deepEqual(buildChanges(professional, ['name', 'specialty', 'address', 'phone'], values, categories), {
        name: candidate.name, phone: candidate.phone
    });
    assert.deepEqual(buildChanges(professional, [], values, categories), {});
    assert.deepEqual(buildChanges(professional, ['address', 'phone'], { ...values, address: 'MORENO 100' }, categories), { address: 'MORENO 100', phone: candidate.phone });
});

test('specialty maps to an existing category ID without renaming shared categories', () => {
    const values = proposedValues({ ...candidate, specialty: 'Cardiología' }, categories);
    assert.deepEqual(buildChanges(professional, ['specialty'], values, categories), { categoria_id: 4 });
    assert.throws(() => buildChanges(professional, ['specialty'], { specialty: '999' }, categories));
    assert.equal(proposedValues({ ...candidate, specialty: 'Unknown specialty' }, categories).specialty, '');
});

test('old reports do not silently identify a changed or duplicate professional', () => {
    const row = { current: professional };
    assert.equal(findLiveRecord(row, [professional]), professional);
    assert.equal(findLiveRecord(row, [{ ...professional, phone: 'NEW' }]), null);
    assert.equal(findLiveRecord(row, [professional, { ...professional, id: 43 }]), null);
    assert.throws(() => validateReport({ version: 1, generatedAt: 'bad', results: [] }));
});

test('server refuses missing configuration, unknown fields and empty values', () => {
    assert.throws(() => configuration({}), error => error.status === 503);
    for (const invalid of [null, { ...body(), before: 'invalid' }, { ...body(), id: '42&or=(id.gt.0)' },
        { ...body(), changes: { certificado_medico_digital: true } }, { ...body(), changes: {} },
        { ...body(), changes: { name: '' } }, { ...body(), changes: { categoria_id: 999.5 } }]) {
        assert.throws(() => validateUpdate(invalid), error => error.status === 400);
    }
});

test('authentication is verified remotely; unapproved and anonymous users are rejected', async () => {
    let called = false;
    await assert.rejects(authorize(null, config, () => { called = true; }), error => error.status === 401);
    assert.equal(called, false);
    await assert.rejects(authorize('Bearer invalid', config, async () => json({}, 401)), error => error.status === 401);
    await assert.rejects(authorize('Bearer valid', config, async () => json({ id: 'stranger', email_confirmed_at: '2026-01-01' })), error => error.status === 403);
    await assert.rejects(authorize('Bearer valid', config, async () => json({ id: 'authorized-id', is_anonymous: true, email_confirmed_at: '2026-01-01' })), error => error.status === 403);
    const user = await authorize('Bearer valid', config, async (url, options) => {
        assert.equal(url.pathname, '/auth/v1/user');
        assert.equal(options.headers.apikey, 'public-test');
        assert.equal(options.headers.Authorization, 'Bearer valid');
        return json({ id: 'authorized-id', email_confirmed_at: '2026-01-01' });
    });
    assert.equal(user.id, 'authorized-id');
});

test('PATCH selects a single ID and all original values, and writes selected fields only', async () => {
    const receipt = await applyUpdate(body(), config, { id: 'authorized-id' }, async (url, options) => {
        assert.equal(url.pathname, '/rest/v1/profesionales');
        assert.equal(options.method, 'PATCH');
        assert.equal(url.searchParams.get('id'), 'eq.42');
        assert.equal(url.searchParams.get('name'), 'eq.ALAMO JOSE ALEJANDRO');
        assert.equal(url.searchParams.get('city'), 'eq.Olavarría');
        assert.equal(url.searchParams.get('categoria_id'), 'eq.3');
        assert.deepEqual(JSON.parse(options.body), body().changes);
        return json([{ ...professional, ...body().changes }]);
    });
    assert.equal(receipt.after.name, professional.name);
    assert.equal(receipt.after.phone, '445100');
});

test('concurrent edits return a conflict; missing categories never trigger a write', async () => {
    await assert.rejects(applyUpdate(body(), config, { id: 'authorized-id' }, async () => json([])), error => error.status === 409);
    let calls = 0;
    await assert.rejects(applyUpdate({ ...body(), changes: { categoria_id: 999 } }, config, { id: 'authorized-id' }, async (url, options) => {
        calls++; assert.equal(url.pathname, '/rest/v1/categorias'); assert.equal(options.method, undefined); return json([]);
    }), error => error.status === 400);
    assert.equal(calls, 1);
});

test('null original fields and reserved filter characters are kept in the conditional update', async () => {
    const request = { ...body(), before: { ...body().before, name: 'A "quoted", name\\', phone: null } };
    await applyUpdate(request, config, { id: 'authorized-id' }, async (url) => {
        assert.equal(url.searchParams.get('phone'), 'is.null');
        assert.equal(url.searchParams.get('name'), 'eq.A "quoted", name\\');
        return json([professional]);
    });
});

test('administrative listings fetch all pages', async () => {
    const offsets = [];
    const records = await listRecords(config, 'categorias', 'id,nombre', async url => {
        const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
        return json(offset === 0 ? categories : []);
    });
    assert.equal(records.length, 2);
    assert.deepEqual(offsets, [0, 2]);
});
