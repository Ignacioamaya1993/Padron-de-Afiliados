// Optional real-browser check. Uses a local fake database; never writes to Supabase.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import handler from '../api/admin.js';
import { bundleCartillaSupabase } from '../../build/cartilla-bundle.mjs';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const qa = resolve(root, '.qa');
await mkdir(qa, { recursive: true });

const vendorPath = resolve(qa, 'supabase-client.js');
await bundleCartillaSupabase(vendorPath);

let passwordRequests = 0;
let refreshRequests = 0;
let logoutRequests = 0;
let refreshToken = null;
let tokenSequence = 0;
let denyAdmin = false;
let failLogout = false;
let adminGate = null;
let logoutGate = null;
let adminRequests = 0;
let adminResponses = 0;

function deferred() {
    let release;
    const promise = new Promise(resolve => {
        release = resolve;
    });
    return { promise, release };
}

async function waitServer(predicate) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server condition timed out');
}

const fakeUser = {
    id: '61ce8393-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@example.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}
};

function fakeSession() {
    const now = Math.floor(Date.now() / 1000);
    tokenSequence++;
    refreshToken = `fake-refresh-token-${tokenSequence}`;

    const header = Buffer.from(JSON.stringify({
        alg: 'HS256', typ: 'JWT'
    })).toString('base64url');

    const payload = Buffer.from(JSON.stringify({
        sub: fakeUser.id,
        aud: 'authenticated',
        role: 'authenticated',
        iat: now,
        exp: now + 3600,
        session_id: '00000000-0000-4000-8000-000000000001',
        jti: String(tokenSequence)
    })).toString('base64url');

    return {
        access_token: `${header}.${payload}.fake-signature`,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        user: fakeUser
    };
}
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
    if (url.pathname === '/auth/v1/user') {
        return response({
            id: denyAdmin ? 'test-non-admin' : 'test-admin',
            email: 'admin@example.test',
            email_confirmed_at: '2026-01-01'
        });
    }
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
        if (url.pathname === '/js/vendor/supabase-client.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(await readFile(vendorPath));
            return;
        }

        if (url.pathname === '/auth/v1/token') {
            let body = '';
            for await (const chunk of req) body += chunk;

            const credentials = JSON.parse(body || '{}');
            const grant = url.searchParams.get('grant_type');

            res.setHeader('Content-Type', 'application/json');

            if (grant === 'password') {
                passwordRequests++;

                if (
                    credentials.email !== 'admin@example.test' ||
                    credentials.password !== 'fake-password'
                ) {
                    res.writeHead(400).end(JSON.stringify({
                        error_code: 'invalid_credentials',
                        msg: 'Invalid login credentials'
                    }));
                    return;
                }
            } else if (grant === 'refresh_token') {
                refreshRequests++;

                if (
                    !refreshToken ||
                    credentials.refresh_token !== refreshToken
                ) {
                    res.writeHead(400).end(JSON.stringify({
                        error_code: 'refresh_token_not_found',
                        msg: 'Invalid refresh token'
                    }));
                    return;
                }
            } else {
                res.writeHead(400).end('{}');
                return;
            }

            res.end(JSON.stringify(fakeSession()));
            return;
        }

        if (url.pathname === '/auth/v1/logout') {
            assert.equal(url.searchParams.get('scope'), 'local');
            logoutRequests++;

            if (logoutGate) {
                await logoutGate.promise;
            }

            if (failLogout) {
                res.destroy();
                return;
            }
            refreshToken = null;
            res.writeHead(204).end();
            return;
        }

        if (url.pathname === '/auth/v1/user') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(fakeUser));
            return;
        }

        if (url.pathname === '/api/cartilla/admin') {
            let body = ''; for await (const chunk of req) body += chunk;
            req.body = body || undefined;
            res.status = code => { res.statusCode = code; return res; };
            res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
            adminRequests++;

            if (adminGate && req.method === 'GET') {
                await adminGate.promise;
            }

            await handler(req, res);
            adminResponses++;
            return;
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
    const reloadPage = async (ignoreCache = false) => {
        await evaluate("window.__previousDocument = true");

        await call('Page.reload', { ignoreCache });

        await waitFor(
            "window.__previousDocument !== true && " +
            "document.documentElement.dataset.adminReady === 'true'"
        );
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
    assert.equal(await evaluate(
        "localStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    assert.equal(await evaluate(
        "Object.values(localStorage).join('').includes('fake-refresh-token-')"
    ), false);

    assert.equal(await evaluate(
        "!!JSON.parse(sessionStorage.getItem('cartilla-medica-auth')).access_token"
    ), true);

    assert.equal(passwordRequests, 1);
    await evaluate("document.querySelector('#caseDetail .actions button:nth-child(2)').click()");
    await waitFor("document.getElementById('progress').innerText.includes('2 de 2')");
    assert.equal(serverDecisions.length, 5);

    // Simulate a later report without local decisions, preserving the tab session.
    await evaluate('localStorage.clear()');
    await reloadPage();
    await waitFor("!document.getElementById('workspace').hidden");
    assert.equal(passwordRequests, 1);
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
    await reloadPage();
    await waitFor("!document.getElementById('workspace').hidden");
    assert.equal(passwordRequests, 1);
    const legacyDocument = await call('DOM.getDocument');
    const legacyFile = await call('DOM.querySelector', { nodeId: legacyDocument.root.nodeId, selector: '#reportFile' });
    await call('DOM.setFileInputFiles', { nodeId: legacyFile.nodeId, files: [changedPath] });
    await waitFor("!document.getElementById('syncLegacy').hidden");
    await evaluate("document.getElementById('syncLegacy').click()");
    await waitFor("document.getElementById('message').innerText.includes('1 decisiones anteriores guardadas')");
    assert.equal(await evaluate("document.querySelectorAll('#caseList button').length"), 0);
    assert.equal(serverDecisions.filter(item => item.profesional_id === 43 && item.field === 'phone' && item.source_value === '999999').length, 1);
    // Hard reload: session must survive without another password request.
    await reloadPage(true);
    await waitFor("!document.getElementById('workspace').hidden");
    assert.equal(passwordRequests, 1);

    // Force an expired stored session and verify SDK refresh on reload.
    const previousRefreshToken = refreshToken;
    const previousRefreshRequests = refreshRequests;

    await evaluate(`(() => {
        const key = 'cartilla-medica-auth';
        const session = JSON.parse(sessionStorage.getItem(key));
        session.expires_at = Math.floor(Date.now() / 1000) - 120;
        sessionStorage.setItem(key, JSON.stringify(session));
    })()`);

    await reloadPage();
    await waitFor("!document.getElementById('workspace').hidden");

    assert.equal(passwordRequests, 1);
    assert.equal(refreshRequests, previousRefreshRequests + 1);
    assert.notEqual(refreshToken, previousRefreshToken);

    assert.equal(await evaluate(
        "JSON.parse(sessionStorage.getItem('cartilla-medica-auth')).refresh_token"
    ), refreshToken);

    console.log('PASS: session persistence, hard reload and refresh token rotation.');

    await evaluate("document.getElementById('logout').click()");
    await waitFor("document.getElementById('workspace').hidden");
    await waitFor(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    );

    // Wait for the logout handler to finish the remote revocation.
    await waitFor("!document.getElementById('logout').disabled");

    assert.equal(logoutRequests, 1);
    assert.equal(refreshToken, null);

    await reloadPage();

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    assert.equal(await evaluate(
        "!document.getElementById('loginPanel').hidden"
    ), true);

    assert.equal(passwordRequests, 1);

    console.log('PASS: local logout and no session restoration after reload.');

    const submitLogin = async () => {
        await evaluate(`
            document.getElementById('email').value = 'admin@example.test';
            document.getElementById('password').value = 'fake-password';
            document.getElementById('loginForm').requestSubmit();
        `);
    };

    const loginReady = async () => {
        await submitLogin();
        await waitFor("!document.getElementById('workspace').hidden");
        await waitFor("!document.querySelector('#loginForm button[type=submit]').disabled");
    };

    // 1. Late administrative response after logout.
    await loginReady();

    adminGate = deferred();

    const requestsBefore = adminRequests;
    const responsesBefore = adminResponses;

    await evaluate("document.getElementById('reload').click()");
    await waitServer(() => adminRequests > requestsBefore);

    await evaluate("document.getElementById('logout').click()");

    await waitFor("document.getElementById('workspace').hidden");
    await waitFor("!document.getElementById('logout').disabled");

    adminGate.release();
    adminGate = null;

    await waitServer(() => adminResponses > responsesBefore);

    await waitFor("!document.getElementById('reload').disabled");

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    assert.equal(await evaluate(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    console.log('PASS: late administrative response discarded after logout.');

    // 2. Login attempt while logout is pending.
    await loginReady();

    logoutGate = deferred();

    const logoutsBefore = logoutRequests;
    const passwordsBefore = passwordRequests;

    await evaluate("document.getElementById('logout').click()");

    await waitServer(() => logoutRequests > logoutsBefore);

    assert.equal(await evaluate(
        "document.querySelector('#loginForm button[type=submit]').disabled"
    ), true);

    await submitLogin();

    assert.equal(passwordRequests, passwordsBefore);

    logoutGate.release();
    logoutGate = null;

    await waitFor("!document.getElementById('logout').disabled");

    assert.equal(passwordRequests, passwordsBefore);

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    console.log('PASS: login blocked during pending logout.');

    // 3. Network failure during logout.
    await loginReady();

    failLogout = true;

    const failedLogoutsBefore = logoutRequests;

    await evaluate("document.getElementById('logout').click()");

    await waitServer(() => logoutRequests > failedLogoutsBefore);

    await waitFor("!document.getElementById('logout').disabled");

    assert.equal(await evaluate(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    assert.equal(await evaluate(
        "document.getElementById('message').innerText.includes('revocación remota')"
    ), true);

    failLogout = false;

    await reloadPage();

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    assert.equal(await evaluate(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    console.log('PASS: network failure during logout does not restore local session.');

    // 4. Authenticated user without administrative permission.
    denyAdmin = true;

    const deniedPasswordsBefore = passwordRequests;
    const deniedResponsesBefore = adminResponses;

    await submitLogin();

    await waitServer(() => adminResponses > deniedResponsesBefore);

    await waitFor(
        "document.getElementById('message').innerText.includes('no tiene permiso')"
    );

    await waitFor(
        "!document.querySelector('#loginForm button[type=submit]').disabled"
    );

    assert.equal(passwordRequests, deniedPasswordsBefore + 1);

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    assert.equal(await evaluate(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    denyAdmin = false;

    await reloadPage();

    assert.equal(await evaluate(
        "document.getElementById('workspace').hidden"
    ), true);

    console.log('PASS: unauthorized administrator rejected and local session removed.');

    // Confirm that normal access still works after all security scenarios.
    await loginReady();

    await evaluate("document.getElementById('logout').click()");
    await waitFor("!document.getElementById('logout').disabled");

    assert.equal(await evaluate(
        "sessionStorage.getItem('cartilla-medica-auth') === null"
    ), true);

    console.log('PASS: normal authentication remains functional.');


    console.log('PASS: browser login, partial save, persistent field decisions after local reset, later report suppression, changed source reopening, reconsideration, legacy synchronization, and logout. No live professional writes.');
} finally {
    socket?.close(); chrome?.kill(); server.closeAllConnections(); server.close(); globalThis.fetch = realFetch;
}
