/**
 * Cubre: src/core/derived-views.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  buildCleanTxt,
  buildCleanCsv,
  buildQualityReport,
  buildGlossaryHits,
  buildFlaggedSegments,
  buildEditLogCsv,
} from '../src/core/derived-views.js';
import { runCleanPipeline } from '../src/core/clean-pipeline.js';
import { acceptSegment } from '../src/ui/review-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsBase = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

async function buildCleanJsonWithPii() {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = [entrada.covariates.site];
  return runCleanPipeline(entrada, glossary, nerPatterns);
}

// --- buildCleanTxt -----------------------------------------------------------

test('buildCleanTxt concatena cleanedText de todos los segmentos separados por línea en blanco', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const txt = buildCleanTxt(cleanJson);
  const parts = txt.split('\n\n');
  assert.equal(parts.length, cleanJson.segments.length);
  cleanJson.segments.forEach((s, i) => assert.equal(parts[i], s.cleanedText));
});

// --- buildCleanCsv -----------------------------------------------------------

test('buildCleanCsv genera una fila por segmento con las columnas del contrato', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildCleanCsv(cleanJson);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'segmentId,start,end,speakerId,cleanedText,wpm,anomalous,confidence');
  assert.equal(lines.length, cleanJson.segments.length + 1);
});

// --- buildQualityReport -------------------------------------------------------

test('buildQualityReport calcula totales, porcentajes y conteo de sustituciones', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const report = buildQualityReport(cleanJson);

  assert.equal(report.totalSegments, cleanJson.segments.length);
  assert.equal(report.editedByHumanPercentage, 0); // ninguno editado aún
  assert.ok(report.anomalousPercentage > 0);
  assert.ok(report.substitutionCounts.glossary >= 1);
  assert.ok(report.substitutionCounts.ner >= 1);
  assert.ok(report.substitutionCounts.punctuation >= 1);
});

test('buildQualityReport refleja segmentos editados por humano tras la revisión', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const reviewed = { ...cleanJson, segments: cleanJson.segments.map((s) => acceptSegment(s)) };
  const report = buildQualityReport(reviewed);
  assert.equal(report.editedByHumanPercentage, 100);
});

// --- buildGlossaryHits --------------------------------------------------------

test('buildGlossaryHits extrae la sustitución de glosario del fixture (seg-001)', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const hits = buildGlossaryHits(cleanJson);
  assert.equal(hits.stage, 'glossary-hits');
  const seg001Hit = hits.hits.find((h) => h.segmentId === 'seg-001');
  assert.ok(seg001Hit);
  assert.equal(seg001Hit.wrong, 'redacción logística');
  assert.equal(seg001Hit.correct, 'regresión logística');
});

// --- buildFlaggedSegments -----------------------------------------------------

test('buildFlaggedSegments marca los segmentos anómalos del fixture', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const flagged = buildFlaggedSegments(cleanJson);
  const expectedAnomalous = cleanJson.segments.filter((s) => s.anomalous).map((s) => s.segmentId);
  for (const id of expectedAnomalous) {
    assert.ok(flagged.segmentIds.includes(id));
  }
});

test('buildFlaggedSegments incluye segmentos con NER sin revisar aunque no sean anómalos', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const flagged = buildFlaggedSegments(cleanJson);
  // seg-002 tiene coincidencias NER y no está marcado como anómalo en el fixture.
  assert.ok(flagged.segmentIds.includes('seg-002'));
});

test('buildFlaggedSegments deja de marcar un segmento NER una vez revisado (type:"human")', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const seg002 = cleanJson.segments.find((s) => s.segmentId === 'seg-002');
  const reviewedSeg002 = acceptSegment(seg002);
  const updated = {
    ...cleanJson,
    segments: cleanJson.segments.map((s) => (s.segmentId === 'seg-002' ? reviewedSeg002 : s)),
  };
  const flagged = buildFlaggedSegments(updated);
  assert.equal(flagged.segmentIds.includes('seg-002'), seg002.anomalous); // solo si además es anómalo
});

// --- buildEditLogCsv -----------------------------------------------------------

test('buildEditLogCsv aplana modificationsLog de todos los segmentos', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildEditLogCsv(cleanJson);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'segmentId,timestamp,type,before,after');

  const totalModifications = cleanJson.segments.reduce((sum, s) => sum + s.modificationsLog.length, 0);
  assert.equal(lines.length, totalModifications + 1);
});

test('buildEditLogCsv redacta before Y after de type:"punctuation" en segmentos con PII (docs/DECISIONS.md §2.2 (5))', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildEditLogCsv(cleanJson);

  // seg-002 tiene PII (nombre/hospital/fecha); su entrada type:"punctuation"
  // debe aparecer completamente redactada (before Y after) en esta vista
  // exportable, a diferencia de clean.json. El "after" de puntuación también
  // contiene PII cruda porque el Módulo A corre antes que el Módulo C (NER).
  const seg002Rows = csv.split('\n').filter((line) => line.startsWith('seg-002,'));
  const punctuationRow = seg002Rows.find((line) => line.includes(',punctuation,'));
  const occurrences = punctuationRow.split('<texto original, ver clean.json>').length - 1;
  assert.equal(occurrences, 2, 'both before and after must be redacted');
  assert.equal(punctuationRow.toLowerCase().includes('juan perez'), false);
  assert.equal(punctuationRow.toLowerCase().includes('12/05/2023'), false);
});

test('buildEditLogCsv NO redacta type:"punctuation" en segmentos sin PII (ej. seg-001)', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildEditLogCsv(cleanJson);

  const seg001Rows = csv.split('\n').filter((line) => line.startsWith('seg-001,'));
  const punctuationRow = seg001Rows.find((line) => line.includes(',punctuation,'));
  assert.equal(punctuationRow.includes('<texto original, ver clean.json>'), false);
});

// --- Regla crítica de privacidad (AC §6): ninguna vista derivada contiene PII real ---

test('AC §6: ninguna vista derivada contiene el valor real de pii-buffer.local.json', async () => {
  const { cleanJson, piiBuffer } = await buildCleanJsonWithPii();

  const views = [
    buildCleanTxt(cleanJson),
    buildCleanCsv(cleanJson),
    JSON.stringify(buildQualityReport(cleanJson)),
    JSON.stringify(buildGlossaryHits(cleanJson)),
    JSON.stringify(buildFlaggedSegments(cleanJson)),
    buildEditLogCsv(cleanJson),
  ];

  for (const view of views) {
    const viewLower = view.toLowerCase();
    for (const entry of piiBuffer.entries) {
      const realValue = entry.originalValue.toLowerCase();
      assert.equal(viewLower.includes(realValue), false, `Una vista derivada no debe contener "${realValue}"`);
    }
  }
});

test('AC §6: las funciones de vistas derivadas no reciben ni pueden acceder a piiBuffer (por firma)', () => {
  // Verificación estructural: ninguna función acepta más de 2 parámetros
  // (cleanJson y, en el caso de flaggedSegments, un umbral numérico), nunca piiBuffer.
  assert.equal(buildCleanTxt.length, 1);
  assert.equal(buildCleanCsv.length, 1);
  assert.equal(buildQualityReport.length, 1);
  assert.equal(buildGlossaryHits.length, 1);
  assert.equal(buildEditLogCsv.length, 1);
  assert.ok(buildFlaggedSegments.length <= 2);
});

test('regenerar una vista derivada reemplaza el contenido por completo (no hay merge parcial)', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const firstCsv = buildCleanCsv(cleanJson);

  const modifiedCleanJson = {
    ...cleanJson,
    segments: cleanJson.segments.map((s) => (s.segmentId === 'seg-001' ? { ...s, cleanedText: 'Texto cambiado.' } : s)),
  };
  const secondCsv = buildCleanCsv(modifiedCleanJson);

  assert.notEqual(firstCsv, secondCsv);
  assert.ok(secondCsv.includes('Texto cambiado.'));
  assert.equal(secondCsv.includes(cleanJson.segments[0].cleanedText), false);
});
