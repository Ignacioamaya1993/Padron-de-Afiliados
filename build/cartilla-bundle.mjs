import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function bundleCartillaSupabase(outfile) {
    await build({
        stdin: {
            contents: "export { createClient } from '@supabase/supabase-js';",
            resolveDir: root,
            sourcefile: 'supabase-client.js',
            loader: 'js'
        },
        outfile: resolve(outfile),
        bundle: true,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        minify: true,
        sourcemap: false,
        legalComments: 'eof',
        logLevel: 'info'
    });
}