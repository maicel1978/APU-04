/**
 * Cubre: src/ui/review-view.js, src/core/session-store.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  acceptSegment,
  editSegment,
  isSegmentReviewed,
  canFinalize,
  finalizeCleanJson,
  sortSegmentsForReview,
  buildChangeHighlight,
} from '../src/ui/review-view.js';
import { createSessionStore, exportSessionFile, importSessionFile } from '../src/core/session-store.js';
import { runCleanPipeline } from '../src/core/clean-pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatterns = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
);

async function buildCleanJson() {
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, true);
  return cleanJson;
}

// --- review-view.js: aceptar / editar --------------------------------------

test('acceptSegment marca el segmento como revisado sin cambiar cleanedText', async () => {
  const cleanJson = await buildCleanJson();
  const original = cleanJson.segments[0];
  const accepted = acceptSegment(original);

  assert.equal(accepted.cleanedText, original.cleanedText);
  assert.equal(accepted.editedByHuman, true);
  assert.equal(isSegmentReviewed(accepted), true);
  assert.equal(isSegmentReviewed(original), false);
});

test('editSegment reemplaza cleanedText y registra la entrada type:"human"', async () => {
  const cleanJson = await buildCleanJson();
  const original = cleanJson.segments[0];
  const edited = editSegment(original, 'Texto corregido manualmente por el investigador.', false);

  assert.equal(edited.cleanedText, 'Texto corregido manualmente por el investigador.');
  assert.equal(edited.editedByHuman, true);
  const humanEntry = edited.modificationsLog.find((e) => e.type === 'human');
  assert.equal(humanEntry.before, original.cleanedText);
  assert.equal(humanEntry.after, 'Texto corregido manualmente por el investigador.');
});

// --- Regla dura crítica: congelación tras finalizedByHuman:true -----------

test('editSegment RECHAZA modificar cleanedText si finalizedByHuman es true (test de regresión obligatorio, AC §3)', async () => {
  const cleanJson = await buildCleanJson();
  const original = cleanJson.segments[0];

  assert.throws(
    () => editSegment(original, 'Intento de edición post-finalización.', true),
    /ya fue finalizada/,
  );
});

// --- canFinalize / finalizeCleanJson ---------------------------------------

test('canFinalize detecta segmentos anómalos sin revisar', async () => {
  const cleanJson = await buildCleanJson();
  const { ok, pendingSegmentIds } = canFinalize(cleanJson);

  const anomalousIds = cleanJson.segments.filter((s) => s.anomalous).map((s) => s.segmentId);
  assert.equal(ok, false);
  assert.deepEqual(pendingSegmentIds.sort(), anomalousIds.sort());
});

test('canFinalize permite finalizar cuando todos los anómalos fueron aceptados o editados', async () => {
  const cleanJson = await buildCleanJson();
  const reviewedSegments = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  const reviewedCleanJson = { ...cleanJson, segments: reviewedSegments };

  const { ok, pendingSegmentIds } = canFinalize(reviewedCleanJson);
  assert.equal(ok, true);
  assert.deepEqual(pendingSegmentIds, []);
});

test('finalizeCleanJson lanza error si quedan anómalos sin revisar (no se puede exportar, AC §3)', async () => {
  const cleanJson = await buildCleanJson();
  assert.throws(() => finalizeCleanJson(cleanJson), /segmentos anómalos sin revisar/);
});

test('finalizeCleanJson activa auditLog.finalizedByHuman cuando todos los anómalos están revisados', async () => {
  const cleanJson = await buildCleanJson();
  const reviewedSegments = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  const reviewedCleanJson = { ...cleanJson, segments: reviewedSegments };

  const finalized = finalizeCleanJson(reviewedCleanJson);
  assert.equal(finalized.auditLog.finalizedByHuman, true);
});

test('una cita de ejemplo (segmentId + charStart/charEnd) sigue siendo válida después de finalizar la revisión', async () => {
  // docs/CONTRACTS.md §5: las citas de APU-05A direccionan con
  // segmentId + charStart/charEnd sobre cleanedText. Este test verifica que
  // el sustring referenciado antes de finalizar sigue siendo idéntico
  // después de finalizedByHuman:true, porque cleanedText queda congelado.
  const cleanJson = await buildCleanJson();
  const reviewedSegments = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  const beforeFinalize = { ...cleanJson, segments: reviewedSegments };

  const targetSegment = beforeFinalize.segments.find((s) => s.segmentId === 'seg-001');
  const charStart = 0;
  const charEnd = Math.min(10, targetSegment.cleanedText.length);
  const citationTextBefore = targetSegment.cleanedText.slice(charStart, charEnd);

  const finalized = finalizeCleanJson(beforeFinalize);
  const finalizedSegment = finalized.segments.find((s) => s.segmentId === 'seg-001');
  const citationTextAfter = finalizedSegment.cleanedText.slice(charStart, charEnd);

  assert.equal(finalized.auditLog.finalizedByHuman, true);
  assert.equal(citationTextAfter, citationTextBefore, 'La cita (segmentId+charStart/charEnd) debe seguir siendo válida tras finalizar.');
});

test('flujo completo: tras finalizar, cualquier intento de editar un segmento debe rechazarse', async () => {
  const cleanJson = await buildCleanJson();
  const reviewedSegments = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  const finalized = finalizeCleanJson({ ...cleanJson, segments: reviewedSegments });

  const targetSegment = finalized.segments[0];
  assert.throws(
    () => editSegment(targetSegment, 'Cambio no permitido.', finalized.auditLog.finalizedByHuman),
    /ya fue finalizada/,
  );
});

// --- sortSegmentsForReview (priorización, §2.3) -----------------------------

test('sortSegmentsForReview prioriza segmentos anómalos primero', async () => {
  const cleanJson = await buildCleanJson();
  const sorted = sortSegmentsForReview(cleanJson.segments);

  const firstAnomalousIndex = sorted.findIndex((s) => s.anomalous);
  const firstNonAnomalousIndex = sorted.findIndex((s) => !s.anomalous);
  // Todos los anómalos deben aparecer antes que al menos un no-anómalo relevante,
  // o no haber no-anómalos; en este fixture hay ambos tipos.
  assert.ok(firstAnomalousIndex !== -1 && firstNonAnomalousIndex !== -1);
  assert.ok(firstAnomalousIndex < firstNonAnomalousIndex);
});

test('sortSegmentsForReview no muta el array original', async () => {
  const cleanJson = await buildCleanJson();
  const originalOrder = cleanJson.segments.map((s) => s.segmentId);
  sortSegmentsForReview(cleanJson.segments);
  assert.deepEqual(cleanJson.segments.map((s) => s.segmentId), originalOrder);
});

// --- buildChangeHighlight (control de cambios, §2.2) ------------------------

test('buildChangeHighlight detecta palabras agregadas y eliminadas', () => {
  const { removed, added } = buildChangeHighlight('la redaccion logistica', 'La regresión logística mostró.');
  assert.ok(removed.includes('redaccion'));
  assert.ok(added.includes('regresión'));
});

// --- session-store.js --------------------------------------------------------

function createInMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

test('session-store: guarda y recupera una sesión con un adaptador en memoria', () => {
  const store = createSessionStore(createInMemoryStorage());
  store.saveSession('caso-001', { progreso: 3, segmentosRevisados: ['seg-001'] });
  const loaded = store.loadSession('caso-001');
  assert.deepEqual(loaded, { progreso: 3, segmentosRevisados: ['seg-001'] });
});

test('session-store: loadSession devuelve null si no hay sesión guardada', () => {
  const store = createSessionStore(createInMemoryStorage());
  assert.equal(store.loadSession('caso-inexistente'), null);
});

test('session-store: clearSession elimina la sesión guardada', () => {
  const store = createSessionStore(createInMemoryStorage());
  store.saveSession('caso-001', { progreso: 1 });
  store.clearSession('caso-001');
  assert.equal(store.loadSession('caso-001'), null);
});

test('session-store: exportSessionFile / importSessionFile son inversas', () => {
  const data = { progreso: 5, nota: 'prueba' };
  const exported = exportSessionFile(data);
  const imported = importSessionFile(exported);
  assert.deepEqual(imported, data);
});

test('session-store: importSessionFile rechaza JSON inválido con mensaje claro', () => {
  assert.throws(() => importSessionFile('{ esto no es json'), /no es un JSON válido/);
});

test('session-store: saveSession rechaza un sessionId inválido', () => {
  const store = createSessionStore(createInMemoryStorage());
  assert.throws(() => store.saveSession('', {}), /identificador de sesión no es válido/);
});
