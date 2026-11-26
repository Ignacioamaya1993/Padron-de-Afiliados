import {
    cpSync,
    mkdirSync,
    rmSync,
    readdirSync,
    existsSync
} from 'node:fs';

import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function copy(relativePath) {
    const source = join(root, relativePath);
    const target = join(dist, relativePath);

    if (!existsSync(source)) {
        throw new Error(`Missing required file: ${relativePath}`);
    }

    cpSync(source, target, { recursive: true });

    console.log(`OK: ${relativePath}`);
}

// Padron: conservar estructura original.
for (const path of [
    'index.html',
    'assets',
    'pages',
    'scripts',
    'styles'
]) {
    copy(path);
}

// Cartilla: publicar solamente archivos necesarios.
for (const path of [
    'cartilla/index.html',
    'cartilla/admin.html',
    'cartilla/404.html',
    'cartilla/css',
    'cartilla/js',
    'cartilla/data/profesionales.json'
]) {
    copy(path);
}

// Publicar imagenes, excluyendo archivos internos.
const imageDir = join(root, 'cartilla/img');

const allowedImages = new Set([
    '.png', '.jpg', '.jpeg', '.webp',
    '.svg', '.gif', '.ico', '.avif'
]);

for (const entry of readdirSync(imageDir, {
    withFileTypes: true
})) {
    if (
        entry.isFile() &&
        allowedImages.has(extname(entry.name).toLowerCase())
    ) {
        copy(`cartilla/img/${entry.name}`);
    }
}

console.log('BUILD OK: dist generated successfully');