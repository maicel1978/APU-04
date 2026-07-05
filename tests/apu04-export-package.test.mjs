/**
 * Cubre: src/core/export-package.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildCleanedPackage, buildTraceabilityPackage, CLEANED_SCHEMA_VERSION } from '../src/core/export-package.js';
import { runCleanPipeline } from '../src/core/clean-pipeline.js';
import { acceptSegment, finalizeCleanJson } from '../src/ui/review-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsBase = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
);

async function buildFinalizedCleanJson(nerOptInActive = false) {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, nerOptInActive);
  const reviewed = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  return finalizeCleanJson({ ...cleanJson, segments: reviewed });
}

// --- buildCleanedPackage -----------------------------------------------------

test('buildCleanedPackage produce un documento con schemaVersion 5.0.0', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  assert.equal(cleaned.schemaVersion, CLEANED_SCHEMA_VERSION);
  assert.equal(cleaned.ecosystem, 'APU');
  assert.equal(cleaned.unit, 'APU-04');
  assert.equal(cleaned.stage, 'cleaned-text');
});

test('buildCleanedPackage conserva speakers[]/covariateProject/covariateSchema intactos (passthrough, Regla 1)', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  assert.deepEqual(cleaned.speakers, cleanJson.speakers);
  assert.deepEqual(cleaned.covariateProject, cleanJson.covariateProject);
  assert.deepEqual(cleaned.covariateSchema, cleanJson.covariateSchema);
});

test('buildCleanedPackage incluye finalizedByHuman como campo plano (no auditLog anidado)', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  assert.equal(cleaned.finalizedByHuman, true);
  assert.equal('auditLog' in cleaned, false);
});

test('buildCleanedPackage: cada segmento SOLO trae segmentId/speakerId/speaker/start/end/cleanedText/confidence', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  const expectedKeys = ['segmentId', 'speakerId', 'speaker', 'start', 'end', 'cleanedText', 'confidence'].sort();
  for (const segment of cleaned.segments) {
    assert.deepEqual(Object.keys(segment).sort(), expectedKeys);
  }
});

test('buildCleanedPackage NUNCA incluye la traza forense (originalText, modificationsLog, wpm, anomalous, anomalyReason, aiSuggested, editedByHuman, source_hash, sourceRefs)', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  const serialized = JSON.stringify(cleaned);
  for (const forbidden of ['originalText', 'modificationsLog', 'anomalyReason', 'aiSuggested', 'editedByHuman', 'source_hash', 'sourceRefs']) {
    assert.equal(serialized.includes(forbidden), false, `no debe incluir "${forbidden}"`);
  }
  assert.deepEqual(cleaned.segments.map((s) => 'wpm' in s), cleaned.segments.map(() => false));
  assert.deepEqual(cleaned.segments.map((s) => 'anomalous' in s), cleaned.segments.map(() => false));
});

test('buildCleanedPackage se parece estructuralmente a la entrada de APU-03 (mismas claves de alto nivel: speakers/covariateProject/covariateSchema/segments)', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const cleaned = buildCleanedPackage(cleanJson);
  for (const key of ['speakers', 'covariateProject', 'covariateSchema', 'segments']) {
    assert.ok(key in cleaned, `debe tener la clave "${key}", igual que speakers.json de APU-03`);
  }
});

// --- buildTraceabilityPackage -------------------------------------------------

test('buildTraceabilityPackage produce un documento con schemaVersion 5.0.0 y stage trazabilidad', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const trace = buildTraceabilityPackage(cleanJson);
  assert.equal(trace.schemaVersion, CLEANED_SCHEMA_VERSION);
  assert.equal(trace.stage, 'trazabilidad');
});

test('buildTraceabilityPackage conserva auditLog, source_hash y sourceRefs completos', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const trace = buildTraceabilityPackage(cleanJson);
  assert.deepEqual(trace.auditLog, cleanJson.auditLog);
  assert.equal(trace.source_hash, cleanJson.source_hash);
  assert.deepEqual(trace.sourceRefs, cleanJson.sourceRefs);
});

test('buildTraceabilityPackage: cada segmento se enlaza por segmentId y trae la traza completa', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const trace = buildTraceabilityPackage(cleanJson);
  const expectedKeys = ['segmentId', 'originalText', 'wpm', 'anomalous', 'anomalyReason', 'aiSuggested', 'editedByHuman', 'modificationsLog'].sort();
  for (const segment of trace.segments) {
    assert.deepEqual(Object.keys(segment).sort(), expectedKeys);
  }
  // Mismos segmentId, mismo orden, para poder cruzar ambos archivos.
  const cleaned = buildCleanedPackage(cleanJson);
  assert.deepEqual(trace.segments.map((s) => s.segmentId), cleaned.segments.map((s) => s.segmentId));
});

test('buildTraceabilityPackage NO incluye speakers[]/covariates (eso vive solo en el archivo principal)', async () => {
  const cleanJson = await buildFinalizedCleanJson();
  const trace = buildTraceabilityPackage(cleanJson);
  assert.equal('speakers' in trace, false);
  assert.equal('covariateProject' in trace, false);
  assert.equal('covariateSchema' in trace, false);
});

test('unión de ambos archivos reconstruye toda la información del documento de trabajo original (nada se pierde)', async () => {
  const cleanJson = await buildFinalizedCleanJson(true); // con PII activo, para cubrir anomalyReason/ner también
  const cleaned = buildCleanedPackage(cleanJson);
  const trace = buildTraceabilityPackage(cleanJson);

  const traceBySegmentId = new Map(trace.segments.map((s) => [s.segmentId, s]));
  for (const cleanSegment of cleaned.segments) {
    const traceSegment = traceBySegmentId.get(cleanSegment.segmentId);
    assert.ok(traceSegment, `debe existir traza para ${cleanSegment.segmentId}`);
  }
  assert.equal(cleaned.segments.length, trace.segments.length);
});
