import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, hasReviewDifferences, caseRemembered } from '../js/review-model.js';

const current = { id: 42, name: 'PEREZ MARIA', address: 'MORENO 2647', phone: '123456', categorias: { nombre: 'CLINICA MEDICA' } };
const source = { name: 'PEREZ MARIA', address: 'MORENO Nº2647', phone: '123456', specialty: 'CLINICA MEDICA' };

test('the panel filters wrong specialties while preserving compatible shortened names', () => {
    const report = validateReport({ version: 1, generatedAt: '2026-11-16', results: [
        { current, candidates: [source, { ...source, specialty: 'CARDIOLOGIA' }, { ...source, name: 'PEREZ MARIA ANA' }] },
        { current, candidates: [{ ...source, specialty: 'CARDIOLOGIA' }] }
    ] });
    assert.equal(report.results.length, 1);
    assert.deepEqual(report.results[0].candidates, [source, { ...source, name: 'PEREZ MARIA ANA' }]);
});

test('the panel does not put numbering-only differences back into pending review', () => {
    assert.equal(hasReviewDifferences({ current, candidates: [source] }), false);
    assert.equal(hasReviewDifferences({ current, candidates: [{ ...source, address: 'MORENO N°2648' }] }), true);
    assert.equal(hasReviewDifferences({ current, candidates: [{ ...source, phone: '999999' }] }), true);
});

test('a numbering-only variation does not invalidate a kept phone decision', () => {
    const candidate = { ...source, phone: '999999' };
    const remembered = [{ profesional_id: 42, field: 'phone', source_identity: 'PEREZ MARIA', current_value: '123456', source_value: '999999', revoked_at: null }];
    assert.equal(caseRemembered({ current, candidates: [candidate] }, current, remembered), true);
});
