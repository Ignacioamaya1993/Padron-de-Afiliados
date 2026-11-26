// Optional real-browser check. Uses a local fake database; never writes to Supabase.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import handler from '../api/admin.js';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const qa = resolve(root, '.qa');
await mkdir(qa, { recursive: true });
const records = [
    { id: 42, name: 'ALAMO JOSE ALEJANDRO', address: 'ESPAÑA 2727', phone: '442030', city: 'Olavarría', categoria_id: 3, categorias: { nombre: 'CLINICA QUIRURGICA' } },
    { id: 43, name: 'PEREZ ANA', address: 'PAZ 25', phone: '123456', city: 'Olavarría', categoria_id: 3, categorias: { nombre: 'CLINICA QUIRURGICA' } }
];
const categories = [{ id: 3, nombre: 'CLINICA QUIRURGICA' }, { id: 4, nombre: 'CARDIOLOGIA' }];
const serverDecisions = [];
const fixture = { version: 1, generatedAt: new Date().toISOString(), results: records.map(current => ({
    current: { ...current }, status: 'posible_coincidencia', candidates: [{ name: current.id === 42 ? 'ALAMO ALEJANDRO JOSE' : 'PEREZ ANA',
        address: 'ESPAÑA Nº 2727', phone: '445100', specialty: 'CLINICA QUIRURGICA' }]
})) };
const reportPath = resolve(qa, 'test-report.json');
await writeFile(reportPath, JSON.stringify(fixture));
process.env.CARTILLA_ADMIN_USER_IDS = 'test-admin';
process.env.CARTILLA_SUPABASE_SERVICE_ROLE_KEY = 'fake-server-test-key';
const realFetch = globalThis.fetch;
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (!url.hostname.endsWith('.supabase.co')) return realFetch(input, options);
    if (url.pathname === '/auth/v1/user') return response({ id: 'test-admin', email: 'admin@example.test', email_confirmed_at: '2026-01-01' });
    const table = url.pathname.split('/').at(-1);
    if (table === 'revision_decisiones') {
        if (options.method === 'POST') {
            const saved = JSON.parse(options.body).map(item => {
                let existing = serverDecisions.find(entry => entry.fingerprint === item.fingerprint);
                if (existing) Object.assign(existing, item);
                else { existing = { ...item, id: serverDecisions.length + 1 }; serverDecisions.push(existing); }
                return existing;
            });
            return response(saved);
        }
        if (options.method === 'PATCH') {
            const existing = serverDecisions.find(entry => `eq.${entry.id}` === url.searchParams.get('id'));
            if (existing) Object.assign(existing, JSON.parse(options.body));
            return new Response(null, { status: 204 });
        }
        return response(Number(url.searchParams.get('offset')) > 0 ? [] : serverDecisions.filter(entry => !entry.revoked_at));
    }
    if (options.method === 'PATCH') {
        const record = records.find(item => `eq.${item.id}` === url.searchParams.get('id'));
        assert(record);
        for (const field of ['name', 'address', 'phone', 'city', 'categoria_id']) {
            assert.equal(url.searchParams.get(field), `eq.${record[field]}`);
        }
        Object.assign(record, JSON.parse(options.body));
        return response([record]);
    }
    let selected = table === 'profesionales' ? records : categories;
    if (url.searchParams.has('id')) selected = selected.filter(item => `eq.${item.id}` === url.searchParams.get('id'));
    return response(Number(url.searchParams.get('offset')) > 0 ? [] : selected);
};
let chrome;
let socket;
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/auth/v1/token') {
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ access_token: 'fake-browser-token' })); return;
        }
        if (url.pathname === '/auth/v1/logout') { res.end('{}'); return; }
        if (url.pathname === '/api/cartilla/admin') {
            let body = ''; for await (const chunk of req) body += chunk;
            req.body = body || undefined;
            res.status = code => { res.statusCode = code; return res; };
            res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
            await handler(req, res); return;
        }
        if (url.pathname === '/js/env.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(`export const ENV = { SUPABASE_URL: 'http://127.0.0.1:${server.address().port}', SUPABASE_ANON_KEY: 'fake-public-key' };`); return;
        }
        const path = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!path.startsWith(root + '\\') && !path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
        res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
        res.end(await readFile(path));
    } catch { res.writeHead(500).end('Test server error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    const binary = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    chrome = spawn(binary, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
        `--user-data-dir=${resolve(qa, 'chrome-profile')}`, '--window-size=1440,1100', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const debugging = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + stderr.slice(-500))), 15000);
        chrome.on('error', error => { clearTimeout(timer); reject(error); });
        chrome.stderr.on('data', chunk => {
            stderr += chunk;
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(new URL(match[1]).origin.replace('ws:', 'http:')); }
        });
    });
    const pages = await (await realFetch(debugging + '/json')).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    const pending = new Map(); let nextId = 1;
    socket.addEventListener('message', event => {
        const result = JSON.parse(event.data); if (!result.id) return;
        const callbacks = pending.get(result.id); if (!callbacks) return; pending.delete(result.id);
        result.error ? callbacks.reject(new Error(JSON.stringify(result.error))) : callbacks.resolve(result.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.result.description);
        return result.result.value;
    };
    const waitFor = async expression => {
        const end = Date.now() + 10000;
        while (Date.now() < end) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
        throw new Error('Browser wait failed: ' + expression + '\n' + await evaluate("document.getElementById('message')?.innerText"));
    };
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/admin.html` });
    await waitFor("document.documentElement.dataset.adminReady === 'true'");
    await evaluate("document.getElementById('email').value='admin@example.test'; document.getElementById('password').value='fake-password'; document.getElementById('loginForm').requestSubmit();");
    await waitFor("!document.getElementById('workspace').hidden");
    const documentNode = await call('DOM.getDocument');
    const fileNode = await call('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#reportFile' });
    await call('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [reportPath] });
    await waitFor("!!document.getElementById('field-phone')");
    assert.equal(await evaluate("document.getElementById('field-name').checked"), false);
    await evaluate("document.querySelector('[data-action=remember][data-field=name]').click()");
    await waitFor("!!document.querySelector('[data-action=forget][data-field=name]')");
    assert.equal(serverDecisions.length, 1);
    await evaluate("document.getElementById('field-address').click();document.getElementById('field-phone').click();document.querySelector('#caseDetail .primary').click();");
    await waitFor("document.getElementById('confirmDialog').open");
    const confirmation = await evaluate("document.getElementById('confirmContent').innerText");
    assert(confirmation.includes('445100')); assert(!confirmation.includes('ALAMO ALEJANDRO JOSE'));
    await call('Page.captureScreenshot', { format: 'png' }).then(result => writeFile(resolve(qa, 'admin-review.png'), Buffer.from(result.data, 'base64')));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    await call('Page.captureScreenshot', { format: 'png' }).then(result => writeFile(resolve(qa, 'admin-review-mobile.png'), Buffer.from(result.data, 'base64')));
    await call('Emulation.clearDeviceMetricsOverride');
    await evaluate("document.getElementById('confirmSave').click()");
    await waitFor("document.getElementById('message').innerText.includes('Cambios guardados')");
    assert.equal(records[0].name, 'ALAMO JOSE ALEJANDRO'); assert.equal(records[0].phone, '445100'); assert.equal(records[0].categoria_id, 3);
    assert.equal(records[1].phone, '123456');
    assert.equal(await evaluate("Object.values(localStorage).join('').includes('fake-browser-token')"), false);
    await evaluate("document.querySelector('#caseDetail .actions button:nth-child(2)').click()");
    await waitFor("document.getElementById('progress').innerText.includes('2 de 2')");
    assert.equal(serverDecisions.length, 5);

    // Simulate a different browser/two months later: no local decisions and a fresh report.
    await evaluate('localStorage.clear()');
    await call('Page.reload');
    await waitFor("document.documentElement.dataset.adminReady === 'true'");
    await evaluate("document.getElementById('email').value='admin@example.test'; document.getElementById('password').value='fake-password'; document.getElementById('loginForm').requestSubmit();");
    await waitFor("!document.getElementById('workspace').hidden");
    const future = { ...fixture, generatedAt: '2027-01-16T12:00:00Z', results: fixture.results.map((item, index) => ({ ...item, current: { ...records[index] } })) };
    const futurePath = resolve(qa, 'future-report.json'); await writeFile(futurePath, JSON.stringify(future));
    const newDocument = await call('DOM.getDocument');
    const newFile = await call('DOM.querySelector', { nodeId: newDocument.root.nodeId, selector: '#reportFile' });
    await call('DOM.setFileInputFiles', { nodeId: newFile.nodeId, files: [futurePath] });
    await waitFor("document.getElementById('progress').innerText.includes('2 de 2')");
    assert.equal(await evaluate("document.querySelectorAll('#caseList button').length"), 0);
    await evaluate("document.getElementById('caseFilter').value='kept'; document.getElementById('caseFilter').dispatchEvent(new Event('change'))");
    assert.equal(await evaluate("document.querySelectorAll('#caseList button').length"), 2);

    const changedPath = resolve(qa, 'changed-source-report.json');
    future.results[1].candidates = [{ ...future.results[1].candidates[0], phone: '999999' }];
    await writeFile(changedPath, JSON.stringify(future));
    await evaluate("document.getElementById('caseFilter').value='pending'; document.getElementById('caseFilter').dispatchEvent(new Event('change'))");
    await call('DOM.setFileInputFiles', { nodeId: newFile.nodeId, files: [changedPath] });
    await waitFor("document.querySelector('#caseDetail h2')?.innerText === 'PEREZ ANA'");
    assert.equal(await evaluate("!!document.querySelector('[data-action=forget][data-field=phone]')"), false);
    assert.equal(await evaluate("!!document.querySelector('[data-action=forget][data-field=address]')"), true);
    await evaluate("document.querySelector('[data-action=forget][data-field=address]').click()");
    await waitFor("!!document.querySelector('[data-action=remember][data-field=address]')");
    assert.equal(serverDecisions.filter(item => item.revoked_at).length, 1);

    // A previous local-only 'keep' can be explicitly synchronized once.
    await evaluate(`(async () => {
        const { caseKey } = await import('/js/review-model.js');
        const row = ${JSON.stringify(future.results[1])};
        localStorage.setItem('cartilla-review-v1:127.0.0.1', JSON.stringify({ [caseKey(row)]: { status: 'kept', at: '2026-11-16' } }));
    })()`);
    await call('Page.reload');
    await waitFor("document.documentElement.dataset.adminReady === 'true'");
    await evaluate("document.getElementById('email').value='admin@example.test'; document.getElementById('password').value='fake-password'; document.getElementById('loginForm').requestSubmit();");
    await waitFor("!document.getElementById('workspace').hidden");
    const legacyDocument = await call('DOM.getDocument');
    const legacyFile = await call('DOM.querySelector', { nodeId: legacyDocument.root.nodeId, selector: '#reportFile' });
    await call('DOM.setFileInputFiles', { nodeId: legacyFile.nodeId, files: [changedPath] });
    await waitFor("!document.getElementById('syncLegacy').hidden");
    await evaluate("document.getElementById('syncLegacy').click()");
    await waitFor("document.getElementById('message').innerText.includes('1 decisiones anteriores guardadas')");
    assert.equal(await evaluate("document.querySelectorAll('#caseList button').length"), 0);
    assert.equal(serverDecisions.filter(item => item.profesional_id === 43 && item.field === 'phone' && item.source_value === '999999').length, 1);
    await evaluate("document.getElementById('logout').click()");
    await waitFor("document.getElementById('workspace').hidden");
    console.log('PASS: browser login, partial save, persistent field decisions after local reset, later report suppression, changed source reopening, reconsideration, legacy synchronization, and logout. No live professional writes.');
} finally {
    socket?.close(); chrome?.kill(); server.closeAllConnections(); server.close(); globalThis.fetch = realFetch;
}
