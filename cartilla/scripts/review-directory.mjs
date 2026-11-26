import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fetchProfessionals, validateSnapshot } from '../js/data-source.js';
import { SOURCE_URL, parseDirectory, compareDirectories, renderReport, describeSource } from './directory-comparison.mjs';

try {
    let current;
    let currentSource = 'Consulta a Supabase en esta ejecución';
    let snapshotDate = null;
    try {
        const config = await readFile(new URL('../js/env.js', import.meta.url), 'utf8');
        const { ENV } = await import(`data:text/javascript;base64,${Buffer.from(config).toString('base64')}`);
        current = await fetchProfessionals(ENV, AbortSignal.timeout(60000));
        if (!current.length) throw new Error('Empty directory');
        validateSnapshot({ version: 1, generatedAt: new Date().toISOString(), professionals: current });
    } catch {
        const snapshot = validateSnapshot(JSON.parse(await readFile(new URL('../data/profesionales.json', import.meta.url), 'utf8')));
        current = snapshot.professionals;
        if (!current.length) throw new Error('La copia de la cartilla está vacía.');
        currentSource = 'Respaldo JSON: Supabase no estuvo disponible. La comparación puede usar datos anteriores';
        snapshotDate = snapshot.generatedAt;
        console.warn('Se usará el respaldo JSON; su fecha aparecerá en el informe.');
    }
    // One request per review. Never crawl individual profiles or submit searches.
    const response = await fetch(SOURCE_URL, {
        headers: { 'User-Agent': 'CartillaMedicaComparison/1.0 (+https://github.com/Ignacioamaya1993/Cartilla-Medica)' },
        signal: AbortSignal.timeout(60000), cache: 'no-store'
    });
    const html = await response.text();
    const diagnostic = describeSource(response, html);
    console.log('Respuesta del sitio de origen:', JSON.stringify(diagnostic));
    const diagnosticDirectory = new URL('../reports/', import.meta.url);
    await mkdir(diagnosticDirectory, { recursive: true });
    await writeFile(new URL('diagnostico-origen.json', diagnosticDirectory), JSON.stringify(diagnostic, null, 2), 'utf8');
    if (!response.ok) throw new Error(`El listado externo respondió HTTP ${response.status}. Ver diagnostico-origen.json.`);
    if (diagnostic.possibleAccessChallenge) throw new Error('El sitio de origen requiere verificación de acceso desde este servidor. Ver diagnostico-origen.json.');
    const external = parseDirectory(html);
    // Catch challenge pages, changed layouts and partial/empty responses.
    if (external.length < 100) throw new Error('Listado externo incompleto o con formato distinto: revisión cancelada.');
    const results = compareDirectories(current, external);
    const counts = Object.fromEntries(['diferencias', 'ambiguo', 'posible_coincidencia', 'no_encontrado', 'origen_incompleto', 'sin_diferencias']
        .map(status => [status, results.filter(row => row.status === status).length]));
    const report = { version: 1, generatedAt: new Date().toISOString(), sourceUrl: SOURCE_URL,
        currentSource, snapshotDate, currentCount: current.length, externalCount: external.length,
        unmatchedCount: current.length - results.length, counts, results };
    const output = new URL('../reports/', import.meta.url);
    await mkdir(output, { recursive: true });
    await writeFile(new URL('revision-profesionales.html', output), renderReport(report), 'utf8');
    await writeFile(new URL('revision-profesionales.json', output), JSON.stringify(report, null, 2) + '\n', 'utf8');
    const summary = `## Revisión de profesionales\n\nCartilla: ${current.length}. Origen externo: ${external.length}.\nSolo coincidencias de profesional y especialidad: ${results.length}. Sin coincidencia conjunta (excluidos): ${current.length - results.length}.\n\n` +
        Object.entries(counts).map(([status, count]) => `- ${status}: ${count}`).join('\n') +
        `\n\n${currentSource}${snapshotDate ? ` (${snapshotDate})` : ''}.\n\n` +
        'No se modificaron datos. Descargá el artifact **revision-profesionales** de esta ejecución y abrí revision-profesionales.html.\n';
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
    console.log(summary);
} catch (error) {
    console.error('No se pudo generar la revisión:', error.message, error.cause?.code || '');
    process.exitCode = 1;
}
