/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Web Worker que ejecuta clean-pipeline.js sin bloquear la UI. Contrato de
 * mensajería: RUN_PIPELINE -> PIPELINE_RESULT | PIPELINE_ERROR (ver
 * tests/apu04-worker.test.mjs y src/ui/worker-client.js, que lo consume).
 * `nerOptInActive` viaja en el payload (Regla 3: opt-in, off por defecto).
 */

import { runCleanPipeline } from '../core/clean-pipeline.js';

// Este módulo se ejecuta como cuerpo de un Worker (self = WorkerGlobalScope).
// No hay build step, por lo que este mismo archivo debe poder cargarse tanto
// como módulo de Worker "clásico" (new Worker(url, { type: 'module' })) como,
// si el entorno de despliegue lo requiere (apertura directa por archivo,
// docs/DECISIONS.md), empaquetado como Inline Worker vía Blob
// (ver createInlineWorkerUrl más abajo).

self.onmessage = async (event) => {
  const { type, canonicalInput, glossaryEntries, nerPatterns, nerOptInActive } = event.data ?? {};

  if (type !== 'RUN_PIPELINE') {
    self.postMessage({
      type: 'PIPELINE_ERROR',
      message: 'Mensaje no reconocido por el Worker de limpieza.',
    });
    return;
  }

  try {
    const { cleanJson, piiBuffer } = await runCleanPipeline(
      canonicalInput,
      glossaryEntries,
      nerPatterns,
      Boolean(nerOptInActive),
    );
    self.postMessage({ type: 'PIPELINE_RESULT', cleanJson, piiBuffer });
  } catch (error) {
    // BUGFIX (2026-07): antes siempre se enviaba un mensaje genérico y solo
    // el detalle real viajaba en `detail`, que worker-client.js nunca leía;
    // el usuario final no tenía forma de saber qué falló. Los mensajes que
    // lanza el pipeline (schema-validator.js, ingest-adapter.js, etc.) ya
    // están redactados en español y sin datos sensibles ni trazas técnicas
    // (ver docs/DECISIONS.md), así que son seguros de mostrar directamente.
    const detail = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'PIPELINE_ERROR',
      message: detail || 'No se pudo procesar la entrevista. Verifique el archivo de entrada e inténtelo de nuevo.',
      detail,
    });
  }
};

/**
 * Construye una URL de Blob para instanciar este Worker sin depender de una
 * ruta de archivo servida por HTTP (los Workers se instancian como Inline
 * Workers vía Blob para evitar bloqueos de CORS en `file://` cuando aplique).
 * Uso previsto en src/ui/app.js:
 *
 *   const workerUrl = await createInlineWorkerUrl(new URL('./clean-pipeline.worker.js', import.meta.url));
 *   const worker = new Worker(workerUrl, { type: 'module' });
 *
 * @param {URL} sourceUrl - URL del propio archivo de Worker.
 * @returns {Promise<string>} URL de objeto (Blob) lista para `new Worker(...)`.
 */
export async function createInlineWorkerUrl(sourceUrl) {
  const response = await fetch(sourceUrl);
  const sourceText = await response.text();
  const blob = new Blob([sourceText], { type: 'text/javascript' });
  return URL.createObjectURL(blob);
}
