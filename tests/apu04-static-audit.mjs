/**
 * Auditoría estática de src/: sin llamadas de red (salvo la excepción
 * documentada del Worker), sin tecnologías prohibidas (docs/DECISIONS.md),
 * cabecera de comentario presente, límite de 350 líneas por archivo, y "id"
 * usado únicamente en ingest-adapter.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(__dirname, '..', 'src');
const MAX_LINES = 350;

// Patrones prohibidos por docs/DECISIONS.md §2 y docs/DECISIONS.md §3.2.
const FORBIDDEN_NETWORK_PATTERNS = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\s*\(/];
const FORBIDDEN_TECH_PATTERNS = [
  /\bpresidio\b/i,
  /\bpython\b/i,
  /openai/i,
  /anthropic/i,
  /\bonnxruntime\b/i,
  /\bhugging ?face\b/i,
];
// Excepción única, documentada explícitamente (no un allowlist genérico de "fetch"):
// src/workers/clean-pipeline.worker.js usa fetch() únicamente para leer su PROPIO
// código fuente local (mismo origen, vía import.meta.url) y convertirlo en un Blob,
// para el patrón "Inline Worker vía Blob" (necesario si se abre por archivo en vez
// de servidor HTTP). No es una llamada de red a un servicio externo ni viola la
// regla de procesamiento 100% local; no se aplica a ningún otro archivo ni a
// ningún otro uso de fetch/XHR/WebSocket.
const KNOWN_LOCAL_FETCH_EXCEPTION = 'workers/clean-pipeline.worker.js';


/**
 * Recorre recursivamente un directorio devolviendo las rutas absolutas de
 * todos los archivos `.js`/`.mjs` encontrados.
 * @param {string} dir
 * @returns {string[]}
 */
function listJsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listJsFiles(fullPath));
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const jsFiles = listJsFiles(SRC_ROOT);

test('auditoría estática: se encontraron archivos .js dentro de src/ para auditar', () => {
  assert.ok(jsFiles.length > 0, 'No se encontraron archivos .js en src/; verifique la ruta de auditoría.');
});

test('auditoría estática: ningún archivo de src/ usa fetch/XMLHttpRequest/WebSocket, salvo la excepción documentada de Inline Worker vía Blob (docs/DECISIONS.md)', () => {
  const offenders = [];
  for (const file of jsFiles) {
    const relativePath = path.relative(SRC_ROOT, file);
    const content = readFileSync(file, 'utf-8');
    for (const pattern of FORBIDDEN_NETWORK_PATTERNS) {
      if (pattern.test(content) && relativePath !== KNOWN_LOCAL_FETCH_EXCEPTION) {
        offenders.push(`${relativePath} coincide con ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Se encontraron llamadas de red prohibidas: ${offenders.join('; ')}`);
});

test('auditoría estática: la única excepción de fetch() es local (mismo origen, lee su propio código fuente para Inline Worker vía Blob)', () => {
  const workerPath = path.join(SRC_ROOT, KNOWN_LOCAL_FETCH_EXCEPTION);
  const content = readFileSync(workerPath, 'utf-8');
  // Verifica que el uso de fetch esté atado a un parámetro de tipo URL derivado
  // de import.meta.url (mismo origen), no a una URL externa hardcodeada.
  assert.match(content, /fetch\(sourceUrl\)/);
  assert.doesNotMatch(content, /fetch\(\s*['"`]https?:\/\//);
});

test('auditoría estática: ningún archivo de src/ referencia Python/Presidio/SDKs de IA en la nube (docs/DECISIONS.md §2)', () => {
  const offenders = [];
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf-8');
    for (const pattern of FORBIDDEN_TECH_PATTERNS) {
      if (pattern.test(content)) {
        offenders.push(`${path.relative(SRC_ROOT, file)} coincide con ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Se encontraron referencias prohibidas: ${offenders.join('; ')}`);
});

test('auditoría estática: todo archivo .js de src/ tiene un comentario de cabecera no vacío', () => {
  const offenders = [];
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf-8').trimStart();
    const headerRegion = content.slice(0, 1000);
    const hasNonEmptyBlockComment = /^\/\*\*[\s\S]*?\S[\s\S]*?\*\//.test(headerRegion);
    if (!hasNonEmptyBlockComment) {
      offenders.push(path.relative(SRC_ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `Archivos sin cabecera de documentación: ${offenders.join(', ')}`);
});

test('auditoría estática: ningún archivo .js de src/ supera el límite de 350 líneas', () => {
  const offenders = [];
  for (const file of jsFiles) {
    const lineCount = readFileSync(file, 'utf-8').split('\n').length;
    if (lineCount > MAX_LINES) {
      offenders.push(`${path.relative(SRC_ROOT, file)} (${lineCount} líneas)`);
    }
  }
  assert.deepEqual(offenders, [], `Archivos que exceden ${MAX_LINES} líneas: ${offenders.join(', ')}`);
});

test('auditoría estática: ningún archivo de src/ usa "id" como nombre de segmento fuera de ingest-adapter.js', () => {
  const offenders = [];
  for (const file of jsFiles) {
    if (path.basename(file) === 'ingest-adapter.js') continue;
    const content = readFileSync(file, 'utf-8');
    // Detección heurística: acceso a segment.id o desestructuración { id } en
    // contextos de segmento; no es un parser de AST, es una señal de alarma
    // acotada al patrón ya prohibido explícitamente por el protocolo.
    if (/segment\.id\b/.test(content) || /\{\s*id\s*[,}]/.test(content)) {
      offenders.push(path.relative(SRC_ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `Posible uso de "id" fuera de ingest-adapter.js: ${offenders.join(', ')}`);
});
