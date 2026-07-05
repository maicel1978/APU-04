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
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
);

async function buildCleanJsonWithPii() {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];
  return runCleanPipeline(entrada, glossary, nerPatterns, true);
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

test('buildCleanCsv genera una fila por segmento con las columnas fijas + covariables dinámicas', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildCleanCsv(cleanJson);
  const lines = csv.split('\n');
  // El fixture tiene covariables "grupo_estudio" y "sitio" en spk-2 (Regla del contrato §5).
  assert.equal(lines[0], 'segmentId,start,end,speakerId,speaker,cleanedText,wpm,anomalous,confidence,cv_grupo_estudio,cv_sitio');
  assert.equal(lines.length, cleanJson.segments.length + 1);
});

test('buildCleanCsv deja vacías las celdas de covariables para hablantes que no las tienen', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildCleanCsv(cleanJson);
  // seg-004 es de spk-1 (Entrevistador), que no tiene covariables en el fixture.
  const seg004Row = csv.split('\n').find((line) => line.startsWith('seg-004,'));
  assert.ok(seg004Row.endsWith(',,'), 'las dos últimas columnas de covariables deben quedar vacías');
});

// --- buildQualityReport -------------------------------------------------------

test('buildQualityReport calcula totales, porcentajes, wpm y conteo de sustituciones (Regla 2 del encargo)', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const report = buildQualityReport(cleanJson);

  assert.equal(report.totalSegments, cleanJson.segments.length);
  assert.equal(report.editedByHumanPercentage, 0); // ninguno editado aún
  assert.ok(report.anomalousPercentage > 0);
  assert.ok(report.totalWords > 0);
  assert.ok(report.wpmAverage > 0);
  assert.ok(report.longPauseCount >= 1); // seg-004 tiene pausa larga respecto a seg-003
  assert.ok(report.substitutionCounts.glossary >= 1);
  assert.ok(report.substitutionCounts.ner >= 1);
  assert.ok(report.substitutionCounts.punctuation >= 1);
  assert.ok(report.suspiciousTermsCount >= 1);
});

test('buildQualityReport refleja segmentos editados por humano tras la revisión', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const reviewed = { ...cleanJson, segments: cleanJson.segments.map((s) => acceptSegment(s)) };
  const report = buildQualityReport(reviewed);
  assert.equal(report.editedByHumanPercentage, 100);
});

test('buildQualityReport incluye flaggedSegmentIds coherente con buildFlaggedSegments', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const report = buildQualityReport(cleanJson);
  const flagged = buildFlaggedSegments(cleanJson);
  assert.deepEqual(report.flaggedSegmentIds.sort(), flagged.segmentIds.sort());
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
  assert.equal(flagged.segmentIds.includes('seg-002'), seg002.anomalous);
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

test('buildEditLogCsv redacta before Y after de type:"punctuation" en segmentos con PII', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildEditLogCsv(cleanJson);

  const seg002Rows = csv.split('\n').filter((line) => line.startsWith('seg-002,'));
  const punctuationRow = seg002Rows.find((line) => line.includes(',punctuation,'));
  const occurrences = punctuationRow.split('<texto original, ver cleaned.json>').length - 1;
  assert.equal(occurrences, 2, 'both before and after must be redacted');
  assert.equal(punctuationRow.toLowerCase().includes('juan perez'), false);
  assert.equal(punctuationRow.toLowerCase().includes('12/05/2023'), false);
});

test('buildEditLogCsv NO redacta type:"punctuation" en segmentos sin PII (ej. seg-001)', async () => {
  const { cleanJson } = await buildCleanJsonWithPii();
  const csv = buildEditLogCsv(cleanJson);

  const seg001Rows = csv.split('\n').filter((line) => line.startsWith('seg-001,'));
  const punctuationRow = seg001Rows.find((line) => line.includes(',punctuation,'));
  assert.equal(punctuationRow.includes('<texto original, ver cleaned.json>'), false);
});

// --- Regla crítica de privacidad: ninguna vista derivada contiene PII real ---

test('las vistas de texto libre (txt/edit-log, y la columna cleanedText del CSV) no contienen el valor real de pii-buffer.local.json', async () => {
  // Nota de diseño (docs/DECISIONS.md): las columnas cv_* de buildCleanCsv son
  // covariables passthrough (Regla 1), declaradas explícitamente por el
  // investigador y ajenas al motor de NER; pueden coincidir por casualidad con
  // un valor enmascarado en el texto libre (p. ej. el sitio/hospital) sin que
  // eso sea una fuga de PII — por eso esta prueba solo audita el texto libre.
  const { cleanJson, piiBuffer } = await buildCleanJsonWithPii();

  const freeTextViews = [buildCleanTxt(cleanJson), buildEditLogCsv(cleanJson)];
  const cleanedTextColumnOnly = cleanJson.segments.map((s) => s.cleanedText).join('\n');

  for (const view of [...freeTextViews, cleanedTextColumnOnly]) {
    const viewLower = view.toLowerCase();
    for (const entity of Object.values(piiBuffer.entityMap)) {
      const realValue = entity.canonicalValue.toLowerCase();
      assert.equal(viewLower.includes(realValue), false, `Una vista de texto libre no debe contener "${realValue}"`);
    }
  }
});

test('buildQualityReport/buildFlaggedSegments (agregados, sin texto libre) tampoco exponen el valor real de PII', async () => {
  const { cleanJson, piiBuffer } = await buildCleanJsonWithPii();
  const views = [JSON.stringify(buildQualityReport(cleanJson)), JSON.stringify(buildFlaggedSegments(cleanJson))];
  for (const view of views) {
    const viewLower = view.toLowerCase();
    for (const entity of Object.values(piiBuffer.entityMap)) {
      const realValue = entity.canonicalValue.toLowerCase();
      assert.equal(viewLower.includes(realValue), false, `Un reporte agregado no debe contener "${realValue}"`);
    }
  }
});

test('las funciones de vistas derivadas no reciben ni pueden acceder a piiBuffer (por firma)', () => {
  assert.equal(buildCleanTxt.length, 1);
  assert.equal(buildCleanCsv.length, 1);
  assert.equal(buildQualityReport.length, 1);
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
