/**
 * Envuelve el contrato de mensajería del Worker (RUN_PIPELINE/PIPELINE_RESULT/
 * PIPELINE_ERROR, ver src/workers/clean-pipeline.worker.js y
 * tests/apu04-worker.test.mjs) en una función async basada en Promesas, para
 * que app.js pueda usarla con await.
 *
 * `createWorkerClient` recibe cualquier objeto tipo Worker (con
 * addEventListener/removeEventListener/postMessage): en el navegador real se
 * le pasa una instancia real de `Worker` (`createCleanPipelineWorker`, solo
 * se ejecuta si existe `Worker` global); en pruebas se inyecta un doble que
 * cumple el mismo contrato de eventos.
 */

/**
 * Envuelve un objeto tipo Worker (real o de prueba) en una función async que
 * ejecuta el pipeline de limpieza y resuelve con `{ cleanJson, piiBuffer }`,
 * o rechaza con un `Error` de mensaje claro en español si el Worker responde
 * `PIPELINE_ERROR` o lanza un error de bajo nivel (`workerInstance.onerror`).
 *
 * @param {{ addEventListener: Function, removeEventListener: Function, postMessage: Function }} workerInstance
 * @returns {(payload: { canonicalInput: object, glossaryEntries: object[], nerPatterns: object }) => Promise<{ cleanJson: object, piiBuffer: object }>}
 */
export function createWorkerClient(workerInstance) {
  if (!workerInstance || typeof workerInstance.postMessage !== 'function') {
    throw new Error('No se pudo inicializar el motor de limpieza en segundo plano.');
  }

  return function runPipeline(payload) {
    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const data = event.data ?? {};
        if (data.type === 'PIPELINE_RESULT') {
          cleanup();
          resolve({ cleanJson: data.cleanJson, piiBuffer: data.piiBuffer });
        } else if (data.type === 'PIPELINE_ERROR') {
          cleanup();
          reject(new Error(data.message || 'No se pudo procesar la entrevista.'));
        }
      };
      const handleError = () => {
        cleanup();
        reject(new Error('El proceso de limpieza en segundo plano falló de forma inesperada.'));
      };
      function cleanup() {
        workerInstance.removeEventListener('message', handleMessage);
        workerInstance.removeEventListener('error', handleError);
      }

      workerInstance.addEventListener('message', handleMessage);
      workerInstance.addEventListener('error', handleError);
      workerInstance.postMessage({ type: 'RUN_PIPELINE', ...payload });
    });
  };
}

/**
 * Crea la instancia real del Worker de limpieza para uso en el navegador
 * (servido por HTTP, ver `npm start` — docs/DECISIONS.md).
 * No se invoca en el entorno de pruebas Node.js (no existe `Worker` global);
 * `app.js` decide en runtime si puede usar esta función (ver `isWorkerSupported`).
 *
 * @returns {Worker}
 */
export function createCleanPipelineWorker() {
  return new Worker(new URL('../workers/clean-pipeline.worker.js', import.meta.url), {
    type: 'module',
  });
}

/**
 * Indica si el entorno actual soporta Web Workers reales (navegador real).
 * En Node.js/jsdom (entorno de pruebas) no existe `Worker` global.
 * @returns {boolean}
 */
export function isWorkerSupported() {
  return typeof Worker !== 'undefined';
}
