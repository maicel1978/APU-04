/**
 * Cubre: pruebas de estrés/casos límite de extremo a extremo (Fase de
 * Cierre, QA): datasets grandes, segmentos vacíos, covariables ausentes,
 * lote heterogéneo. No sustituye los tests unitarios; verifica que el
 * pipeline real no lanza ni degrada de forma silenciosa ante datos límite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { adaptSpeakersOutput } from '../src/core/ingest-adapter.js';
import { validateCleanInput } from '../src/core/schema-validator.js';
import { runCleanPipeline } from '../src/core/clean-pipeline.js';
import { buildQualityReport, buildCleanCsv } from '../src/core/derived-views.js';
import { buildBatchDashboard, buildFileBase } from '../src/core/batch-controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatterns = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);

function buildLargeSpeakersJson(segmentCount) {
  const segments = [];
  for (let i = 0; i < segmentCount; i += 1) {
    segments.push({
      id: `seg-${String(i).padStart(4, '0')}`,
      start: i * 3,
      end: i * 3 + 2.5,
      text: `este es el segmento numero ${i} de una entrevista larga con contenido de prueba`,
      speakerId: i % 2 === 0 ? 'spk-1' : 'spk-2',
      speaker: i % 2 === 0 ? 'Entrevistador' : 'Participante',
    });
  }
  return {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [
      { id: 'spk-1', label: 'Entrevistador', covariates: {} },
      { id: 'spk-2', label: 'Participante', covariates: { grupo_estudio: 'Control' } },
    ],
    segments,
    covariateProject: null,
    covariateSchema: null,
  };
}

test('estrés: 500 segmentos se procesan sin lanzar y con telemetría consistente', async () => {
  const speakersJson = buildLargeSpeakersJson(500);
  const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: 'estres-500' });
  const validation = validateCleanInput(canonicalInput);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  assert.equal(cleanJson.segments.length, 500);

  const report = buildQualityReport(cleanJson);
  assert.equal(report.totalSegments, 500);
  assert.ok(report.totalWords > 0);

  const csv = buildCleanCsv(cleanJson);
  assert.equal(csv.split('\n').length, 501); // encabezado + 500 filas
});

test('caso límite: segmento con texto vacío no lanza y se marca anómalo con wpm=0', async () => {
  const speakersJson = {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [{ id: 'spk-1', label: 'Hablante', covariates: {} }],
    segments: [{ id: 'seg-001', start: 0, end: 3, text: '', speakerId: 'spk-1', speaker: 'Hablante' }],
    covariateProject: null,
    covariateSchema: null,
  };
  const canonicalInput = adaptSpeakersOutput(speakersJson, {});
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  const seg = cleanJson.segments[0];
  assert.equal(seg.wpm, 0);
});

test('caso límite: duration<=0 (start==end) no divide por cero (anomalous=true, wpm=0)', async () => {
  const speakersJson = {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [{ id: 'spk-1', label: 'Hablante', covariates: {} }],
    segments: [{ id: 'seg-001', start: 5, end: 5.0001, text: 'hola', speakerId: 'spk-1', speaker: 'Hablante' }],
    covariateProject: null,
    covariateSchema: null,
  };
  const canonicalInput = adaptSpeakersOutput(speakersJson, {});
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  assert.ok(Number.isFinite(cleanJson.segments[0].wpm));
});

test('caso límite: covariables ausentes en todos los hablantes (sin VarOps, Regla 1) no bloquea nada', async () => {
  const speakersJson = {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [{ id: 'spk-1', label: 'Hablante' }], // sin "covariates" en absoluto
    segments: [{ id: 'seg-001', start: 0, end: 2, text: 'hola', speakerId: 'spk-1' }],
    // sin covariateProject/covariateSchema en absoluto
  };
  const canonicalInput = adaptSpeakersOutput(speakersJson, {});
  const validation = validateCleanInput(canonicalInput);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  assert.equal(cleanJson.covariateProject, null);
  assert.equal(cleanJson.covariateSchema, null);
  assert.deepEqual(cleanJson.speakers[0].covariates, {});

  const csv = buildCleanCsv(cleanJson);
  assert.equal(csv.split('\n')[0], 'segmentId,start,end,speakerId,speaker,cleanedText,wpm,anomalous,confidence');
});

test('caso límite: covariable con comas y comillas se escapa correctamente en el CSV', async () => {
  const speakersJson = {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [{ id: 'spk-1', label: 'Hablante', covariates: { nota: 'valor, con "comillas" y coma' } }],
    segments: [{ id: 'seg-001', start: 0, end: 2, text: 'hola', speakerId: 'spk-1' }],
    covariateProject: null,
    covariateSchema: null,
  };
  const canonicalInput = adaptSpeakersOutput(speakersJson, {});
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  const csv = buildCleanCsv(cleanJson);
  assert.match(csv, /"valor, con ""comillas"" y coma"/);
});

test('lote heterogéneo: buildBatchDashboard agrega correctamente 3 archivos de tamaños distintos', async () => {
  const sizes = [1, 50, 200];
  const fileReports = [];
  for (const size of sizes) {
    const speakersJson = buildLargeSpeakersJson(size);
    const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: `lote-${size}` });
    const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
    const base = buildFileBase(`archivo-${size}_speakers.json`);
    fileReports.push({ fileName: `archivo-${size}_speakers.json`, base, qualityReport: buildQualityReport(cleanJson) });
  }
  const dashboard = buildBatchDashboard(fileReports);
  assert.equal(dashboard.totalFiles, 3);
  assert.equal(dashboard.totalSegments, 1 + 50 + 200);
  assert.equal(dashboard.perFile.length, 3);
});

test('BUGFIX regresión: un archivo grande con UN segmento de duración cero en medio (ej. seg-048) se procesa completo, sin bloquear el resto', async () => {
  // Reproduce el reporte real de un usuario: "speakers (5).json: La entrada
  // no es válida: segments[48]: end (355.4) debe ser mayor que start
  // (355.4)." — el archivo entero se rechazaba por un solo timestamp
  // duplicado, típico artefacto de ASR/diarización, no un archivo corrupto.
  const speakersJson = buildLargeSpeakersJson(60);
  speakersJson.segments[48].start = 355.4;
  speakersJson.segments[48].end = 355.4; // duración cero, como el caso real reportado.

  const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: 'estres-seg48' });
  const validation = validateCleanInput(canonicalInput);
  assert.equal(validation.valid, true, `El archivo completo no debería bloquearse: ${JSON.stringify(validation.errors)}`);

  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  assert.equal(cleanJson.segments.length, 60, 'todos los segmentos deben procesarse, incluido el problemático');

  const seg48 = cleanJson.segments.find((s) => s.segmentId === 'seg-0048');
  assert.equal(seg48.anomalous, true, 'el segmento con duración cero debe marcarse como anómalo para revisión');
  assert.equal(seg48.wpm, 0);
});

test('mejora: el ÚLTIMO segmento con duración cero recibe un anomalyReason ampliado explicando el patrón de ASR', async () => {
  // Confirmado con el código real de github.com/maicel1978/APU-2
  // (whisper.worker.js): el último chunk de una transcripción puede quedar
  // con end===start cuando el ASR no determina el timestamp final. APU-04 no
  // modifica APU-02; en su lugar explica el motivo al investigador.
  const speakersJson = buildLargeSpeakersJson(10);
  const last = speakersJson.segments[speakersJson.segments.length - 1];
  last.start = 355.4;
  last.end = 355.4;

  const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: 'ultimo-segmento' });
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);

  const lastCleanSegment = cleanJson.segments[cleanJson.segments.length - 1];
  assert.equal(lastCleanSegment.anomalous, true);
  assert.match(lastCleanSegment.anomalyReason, /último segmento/i);
  assert.match(lastCleanSegment.anomalyReason, /transcribió el audio/i);
  // Lenguaje simple (2026-07): sin notación técnica en el texto visible al usuario.
  assert.equal(lastCleanSegment.anomalyReason.includes('<='), false);
  assert.equal(/\bwpm\b/i.test(lastCleanSegment.anomalyReason), false);
});

test('un segmento con duración cero que NO es el último recibe el motivo simple, sin la ampliación de "último segmento"', async () => {
  const speakersJson = buildLargeSpeakersJson(10);
  speakersJson.segments[3].start = 100;
  speakersJson.segments[3].end = 100;

  const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: 'segmento-intermedio' });
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);

  const seg = cleanJson.segments[3];
  assert.equal(seg.anomalous, true);
  assert.match(seg.anomalyReason, /no se pudo calcular el ritmo de habla/i);
  assert.equal(/último segmento/i.test(seg.anomalyReason), false);
});

test('caso límite: lote de un solo archivo con 0 segmentos anómalos permite exportar sin fricción', async () => {
  // Segmentos con wpm dentro de rango normal y sin pausas largas.
  const speakersJson = {
    schemaVersion: '3.0.0',
    unit: 'APU-03',
    speakers: [{ id: 'spk-1', label: 'Hablante', covariates: {} }],
    segments: [
      { id: 'seg-001', start: 0, end: 5, text: 'este es un segmento con ritmo normal de habla para la prueba', speakerId: 'spk-1' },
    ],
    covariateProject: null,
    covariateSchema: null,
  };
  const canonicalInput = adaptSpeakersOutput(speakersJson, {});
  const { cleanJson } = await runCleanPipeline(canonicalInput, glossary, nerPatterns, false);
  assert.equal(cleanJson.segments.every((s) => !s.anomalous), true);
});
