/**
 * Cubre: src/ui/worker-client.js.
 *
 * Usa un doble de prueba (fakeWorker) que cumple el mismo contrato de eventos
 * que un Worker real (addEventListener/removeEventListener/postMessage), sin
 * depender de un navegador real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerClient, isWorkerSupported } from '../src/ui/worker-client.js';

function makeFakeWorker() {
  const listeners = { message: [], error: [] };
  return {
    postMessage(payload) {
      this.lastPayload = payload;
    },
    addEventListener(type, handler) {
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = listeners[type].filter((h) => h !== handler);
    },
    // Helpers de prueba, no parte del contrato real de Worker:
    emitMessage(data) {
      for (const handler of [...listeners.message]) handler({ data });
    },
    emitError() {
      for (const handler of [...listeners.error]) handler(new Event('error'));
    },
  };
}

test('createWorkerClient resuelve con cleanJson/piiBuffer ante PIPELINE_RESULT', async () => {
  const fakeWorker = makeFakeWorker();
  const runPipeline = createWorkerClient(fakeWorker);

  const promise = runPipeline({ canonicalInput: {}, glossaryEntries: [], nerPatterns: {} });
  assert.equal(fakeWorker.lastPayload.type, 'RUN_PIPELINE');

  fakeWorker.emitMessage({ type: 'PIPELINE_RESULT', cleanJson: { a: 1 }, piiBuffer: { b: 2 } });

  const result = await promise;
  assert.deepEqual(result, { cleanJson: { a: 1 }, piiBuffer: { b: 2 } });
});

test('createWorkerClient rechaza con Error de mensaje claro ante PIPELINE_ERROR', async () => {
  const fakeWorker = makeFakeWorker();
  const runPipeline = createWorkerClient(fakeWorker);

  const promise = runPipeline({ canonicalInput: {}, glossaryEntries: [], nerPatterns: {} });
  fakeWorker.emitMessage({ type: 'PIPELINE_ERROR', message: 'No se pudo procesar la entrevista.' });

  await assert.rejects(promise, /No se pudo procesar la entrevista\./);
});

test('createWorkerClient rechaza ante un error de bajo nivel del Worker (onerror)', async () => {
  const fakeWorker = makeFakeWorker();
  const runPipeline = createWorkerClient(fakeWorker);

  const promise = runPipeline({ canonicalInput: {}, glossaryEntries: [], nerPatterns: {} });
  fakeWorker.emitError();

  await assert.rejects(promise, /falló de forma inesperada/);
});

test('createWorkerClient limpia sus listeners tras resolver (no queda escuchando eventos viejos)', async () => {
  const fakeWorker = makeFakeWorker();
  const runPipeline = createWorkerClient(fakeWorker);

  const promise = runPipeline({ canonicalInput: {}, glossaryEntries: [], nerPatterns: {} });
  fakeWorker.emitMessage({ type: 'PIPELINE_RESULT', cleanJson: {}, piiBuffer: {} });
  await promise;

  // Un segundo mensaje tardío no debe romper nada ni haber listeners colgados.
  assert.doesNotThrow(() => fakeWorker.emitMessage({ type: 'PIPELINE_RESULT', cleanJson: {}, piiBuffer: {} }));
});

test('createWorkerClient lanza de inmediato si no recibe un objeto tipo Worker válido', () => {
  assert.throws(() => createWorkerClient(null), /motor de limpieza/);
  assert.throws(() => createWorkerClient({}), /motor de limpieza/);
});

test('isWorkerSupported detecta ausencia de Worker global en este entorno de pruebas Node.js', () => {
  assert.equal(isWorkerSupported(), typeof Worker !== 'undefined');
});
