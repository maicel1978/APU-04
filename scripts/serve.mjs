#!/usr/bin/env node
/**
 * Servidor estático local mínimo, sin dependencias nuevas (solo módulos
 * nativos de Node.js). Sirve la raíz del repositorio por HTTP para poder usar
 * el Web Worker y los imports de módulos JSON, que la mayoría de navegadores
 * restringen bajo el protocolo file://.
 *
 * Escucha únicamente en 127.0.0.1 (loopback), nunca en una interfaz pública.
 * Vive fuera de src/, no forma parte del árbol auditado por
 * tests/apu04-static-audit.mjs (es infraestructura de desarrollo, no
 * código de la aplicación).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    let relativePath = decodeURIComponent(requestUrl.pathname);
    if (relativePath === '/') relativePath = '/index.html';

    const filePath = path.normalize(path.join(ROOT_DIR, relativePath));

    // Programación defensiva (R6): nunca servir archivos fuera de la raíz del
    // proyecto, incluso ante intentos de "../" en la URL solicitada.
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403).end('Prohibido.');
      return;
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado.');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType }).end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Error interno del servidor local.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`APU-04 servido localmente en http://${HOST}:${PORT} (Ctrl+C para detener)`);
});
