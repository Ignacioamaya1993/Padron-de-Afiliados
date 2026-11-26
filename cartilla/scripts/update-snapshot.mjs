import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fetchProfessionals, validateSnapshot } from '../js/data-source.js';

try {
    // Import the existing browser configuration without printing its credentials.
    const source = await readFile(new URL('../js/env.js', import.meta.url), 'utf8');
    const { ENV } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const professionals = await fetchProfessionals(ENV, AbortSignal.timeout(60000));
    if (!professionals.length) throw new Error('Empty response; existing snapshot preserved.');
    const snapshot = validateSnapshot({ version: 1, generatedAt: new Date().toISOString(), professionals });
    const directory = new URL('../data/', import.meta.url);
    await mkdir(directory, { recursive: true });
    // Ignore export time when comparing: unchanged records need no commit/deploy.
    try {
        const previous = validateSnapshot(JSON.parse(await readFile(new URL('profesionales.json', directory), 'utf8')));
        if (JSON.stringify(previous.professionals) === JSON.stringify(snapshot.professionals)) {
            console.log(`Supabase consulted successfully: ${professionals.length} professionals, no changes.`);
            process.exit(0);
        }
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn('Previous snapshot invalid; replacing it with validated data.');
    }
    const temporary = new URL('profesionales.json.tmp', directory);
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    await rename(temporary, new URL('profesionales.json', directory));
    console.log(`Snapshot saved: ${professionals.length} professionals (${snapshot.generatedAt}).`);
} catch (error) {
    console.error('Snapshot not updated:', error.message, error.cause?.code || '');
    process.exitCode = 1;
}
