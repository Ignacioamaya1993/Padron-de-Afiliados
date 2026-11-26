import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectory, compareDirectories, renderReport, describeSource } from './directory-comparison.mjs';

const local = { name: 'PÉREZ, MARÍA ANA', address: 'Gral. Paz 2524', phone: '42-3213', city: 'Olavarría', categorias: { nombre: 'Cardiología' } };
const source = { name: 'PEREZ MARIA ANA', address: 'GENERAL PAZ Nº 2524', phone: '423213', specialty: 'CARDIOLOGIA' };

test('reads the expected table, line breaks, entities and blank cells', () => {
    const html = '<table><tr><th>APELLIDO Y NOMBRE</th><th>ESPECIALIDAD</th><th>DOMICILIO</th><th>TELÉFONO</th></tr><tr><td>P&Eacute;REZ MARIA</td><td>CLINICA<br>MEDICA</td><td>PAZ N&#186; 25 &amp; 26</td><td></td></tr></table>';
    assert.deepEqual(parseDirectory(html), [{ name: 'PÉREZ MARIA', specialty: 'CLINICA MEDICA', address: 'PAZ Nº 25 & 26', phone: '' }]);
    assert.throws(() => parseDirectory('<html>temporarily unavailable</html>'), /tabla esperada/);
});

test('normalizes accents, basic address abbreviations and phone punctuation', () => {
    assert.equal(compareDirectories([local], [source])[0].status, 'sin_diferencias');
});

test('accepts a title row before the expected headers', () => {
    const html = '<table><tr><td colspan="4">Profesionales</td></tr><tr><th>APELLIDO Y NOMBRE</th><th>ESPECIALIDAD</th><th>DOMICILIO</th><th>TELEFONO</th></tr><tr><td>PEREZ ANA</td><td>CLINICA</td><td>PAZ 25</td><td>123456</td></tr></table>';
    assert.equal(parseDirectory(html)[0].name, 'PEREZ ANA');
});

test('identifies a challenge page even with HTTP 200', () => {
    const diagnostic = describeSource({ url: 'https://example.org/', status: 200, headers: new Headers({ 'content-type': 'text/html' }) }, '<title>Just a moment...</title><p>Enable JavaScript and cookies</p>');
    assert.equal(diagnostic.possibleAccessChallenge, true);
    assert.equal(diagnostic.tableCount, 0);
    assert.throws(() => parseDirectory('<title>Just a moment...</title>'), /tabla esperada/);
});

test('reports changed contacts but never proposes deleting blank source fields', () => {
    const changed = compareDirectories([local], [{ ...source, address: 'MORENO 100', phone: '' }])[0];
    assert.equal(changed.status, 'diferencias');
    assert.deepEqual(changed.changes, [{ field: 'address', current: local.address, found: 'MORENO 100' }]);
    assert.deepEqual(changed.missingFields, ['phone']);
    assert.equal(compareDirectories([local], [{ ...source, address: '', phone: '' }])[0].status, 'origen_incompleto');
});

test('duplicate names in either directory are ambiguous', () => {
    assert.equal(compareDirectories([local], [source, { ...source, address: 'OTRA 50' }])[0].status, 'ambiguo');
    assert(compareDirectories([local, local], [source]).every(row => row.status === 'ambiguo'));
});

test('compatible shortened names are suggested; absent professionals and different specialties are excluded', () => {
    assert.equal(compareDirectories([local], [{ ...source, name: 'PEREZ MARIA' }])[0].status, 'posible_coincidencia');
    assert.deepEqual(compareDirectories([local], [{ ...source, name: 'GOMEZ JUAN' }]), []);
    assert.deepEqual(compareDirectories([local], [{ ...source, specialty: 'CLINICA MEDICA' }]), []);
    assert.deepEqual(compareDirectories([{ ...local, categorias: null }], [source]), []);
});

test('Aguerre Francisco matches longer given names in either order with the same specialty', () => {
    for (const name of ['AGUERRE FRANCISCO HORACIO', 'AGUERRE HORACIO FRANCISCO']) {
        for (const reverse of [false, true]) {
            const current = { ...local, name: reverse ? name : 'AGUERRE FRANCISCO' };
            const candidate = { ...source, name: reverse ? 'AGUERRE FRANCISCO' : name };
            assert.equal(compareDirectories([current], [candidate])[0].status, 'posible_coincidencia');
            assert.deepEqual(compareDirectories([current], [{ ...candidate, specialty: 'OTRA ESPECIALIDAD' }]), []);
        }
    }
    assert.deepEqual(compareDirectories([{ ...local, name: 'AGUERRE FRANCISCO HORACIO' }], [{ ...source, name: 'AGUERRE FRANCISCO MARIO' }]), []);
    assert.deepEqual(compareDirectories([{ ...local, name: 'AGUERRE' }], [{ ...source, name: 'AGUERRE FRANCISCO' }]), []);
    assert.deepEqual(compareDirectories([{ ...local, name: 'AGUERRE FRANCISCO' }], [{ ...source, name: 'GOMEZ FRANCISCO AGUERRE' }]), []);
});

test('multiple compatible names are presented together for manual identity confirmation', () => {
    const result = compareDirectories([{ ...local, name: 'AGUERRE FRANCISCO' }], [
        { ...source, name: 'AGUERRE FRANCISCO HORACIO' }, { ...source, name: 'AGUERRE FRANCISCO MARIO' }
    ])[0];
    assert.equal(result.status, 'ambiguo');
    assert.equal(result.candidates.length, 2);
});

test('the same person in two specialties is compared independently', () => {
    const other = { ...local, categorias: { nombre: 'CLINICA MEDICA' }, address: 'OTRA 50', phone: '999999' };
    const results = compareDirectories([local, other], [source, { ...source, specialty: 'CLINICA MEDICA', address: 'OTRA 50', phone: '999999' }]);
    assert.equal(results.length, 2);
    assert(results.every(row => row.status === 'sin_diferencias'));
    assert(results.every(row => row.candidates.length === 1));
    assert.equal(results[1].candidates[0].specialty, 'CLINICA MEDICA');
});

test('a full-name word-order difference is allowed only with the same specialty', () => {
    const results = compareDirectories([{ ...local, name: 'ALAMO JOSE ALEJANDRO' }], [{ ...source, name: 'ALAMO ALEJANDRO JOSE' }]);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'sin_diferencias');
});

test('numbering markers do not create address differences, including without a space', () => {
    for (const address of ['MORENO Nº 2647', 'MORENO N° 2647', 'MORENO Nº2647', 'MORENO N°2647', 'MORENO No. 2647', 'MORENO N.º 2647']) {
        const result = compareDirectories([{ ...local, address: 'MORENO 2647' }], [{ ...source, address }])[0];
        assert.deepEqual(result.changes, [], address);
    }
    for (const address of ['MORENO N° 2648', 'MORENO Nº 2647 2º PISO', 'MORENO Nº 2647 DEPTO A']) {
        assert.equal(compareDirectories([{ ...local, address: 'MORENO 2647' }], [{ ...source, address }])[0].changes[0].field, 'address');
    }
});

test('HTML escapes source data and does not mutate input', () => {
    const current = [{ ...local, name: '<img src=x onerror=alert(1)>' }];
    const before = JSON.stringify(current);
    const results = compareDirectories(current, [{ ...source, name: current[0].name, address: 'OTRA 100' }]);
    const html = renderReport({ results, counts: { no_encontrado: 1 }, generatedAt: '2026-11-16', currentSource: 'Test' });
    assert(!html.includes('<img src=x'));
    assert(html.includes('&lt;img'));
    assert.equal(JSON.stringify(current), before);
});
