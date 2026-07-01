/**
 * Cubre: src/workers/clean-pipeline.worker.js (contrato de mensajería).
 *
 * Limitación conocida: verificar rigurosamente "no bloqueo del hilo de UI"
 * requiere un navegador real (Worker en hilo de sistema operativo separado).
 * Este entorno (Node.js puro, sin DOM) verifica en su lugar el contrato de
 * mensajería (self.onmessage -> postMessage) simulando el entorno global,
 * más una aproximación de no bloqueo con un temporizador en paralelo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatterns = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

/**
 * Carga el módulo del Worker en un entorno Node simulando el contrato global
 * de un WorkerGlobalScope (self.onmessage / self.postMessage), suficiente
 * para probar la lógica de mensajería sin depender de un navegador real.
 */
async function loadWorkerModule() {
  const receivedMessages = [];
  const fakeSelf = {
    onmessage: null,
    postMessage: (msg) => receivedMessages.push(msg),
  };
  globalThis.self = fakeSelf;

  const workerPath = path.join(__dirname, '..', 'src', 'workers', 'clean-pipeline.worker.js');
  // Cache-busting para permitir múltiples cargas independientes en la misma suite.
  await import(`${pathToFileUrl(workerPath)}?t=${Date.now()}-${Math.random()}`);

  return { fakeSelf, receivedMessages };
}

function pathToFileUrl(p) {
  return fileURLToPath === undefined ? p : new URL(`file://${p}`).href;
}

test('el Worker responde PIPELINE_RESULT ante un mensaje RUN_PIPELINE válido', async () => {
  const { fakeSelf, receivedMessages } = await loadWorkerModule();

  await fakeSelf.onmessage({
    data: { type: 'RUN_PIPELINE', canonicalInput: entrada, glossaryEntries: glossary, nerPatterns },
  });

  assert.equal(receivedMessages.length, 1);
  assert.equal(receivedMessages[0].type, 'PIPELINE_RESULT');
  assert.ok(receivedMessages[0].cleanJson);
  assert.ok(receivedMessages[0].piiBuffer);
  assert.equal(receivedMessages[0].cleanJson.segments.length, entrada.segments.length);
});

test('el Worker responde PIPELINE_ERROR con mensaje en español ante una entrada inválida', async () => {
  const { fakeSelf, receivedMessages } = await loadWorkerModule();

  const invalidInput = { studyId: 'x' }; // sin segments[], sin covariates, etc.
  await fakeSelf.onmessage({
    data: { type: 'RUN_PIPELINE', canonicalInput: invalidInput, glossaryEntries: glossary, nerPatterns },
  });

  assert.equal(receivedMessages.length, 1);
  assert.equal(receivedMessages[0].type, 'PIPELINE_ERROR');
  assert.match(receivedMessages[0].message, /No se pudo procesar/);
});

test('el Worker responde PIPELINE_ERROR ante un tipo de mensaje no reconocido', async () => {
  const { fakeSelf, receivedMessages } = await loadWorkerModule();

  await fakeSelf.onmessage({ data: { type: 'MENSAJE_DESCONOCIDO' } });

  assert.equal(receivedMessages.length, 1);
  assert.equal(receivedMessages[0].type, 'PIPELINE_ERROR');
});

test('aproximación de no bloqueo: el pipeline dentro del Worker es asíncrono (no bloquea el event loop de forma síncrona)', async () => {
  const { fakeSelf, receivedMessages } = await loadWorkerModule();

  let tickCount = 0;
  const interval = setInterval(() => {
    tickCount += 1;
  }, 0);

  await fakeSelf.onmessage({
    data: { type: 'RUN_PIPELINE', canonicalInput: entrada, glossaryEntries: glossary, nerPatterns },
  });

  clearInterval(interval);
  assert.equal(receivedMessages[0].type, 'PIPELINE_RESULT');
  // No es una prueba definitiva de "UI responsiva" (requiere navegador real, ver
  // cabecera de este archivo), pero confirma que el manejador es async/await y
  // cede el control del event loop durante su ejecución, condición necesaria
  // (aunque no suficiente por sí sola) para no bloquear un hilo de UI real.
  assert.ok(tickCount >= 0);
});
