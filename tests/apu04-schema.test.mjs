/**
 * Cubre: src/core/schema-validator.js, src/core/ingest-adapter.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { validateCleanInput } from '../src/core/schema-validator.js';
import { adaptSpeakersOutput } from '../src/core/ingest-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const canonicoPath = path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json');
const fixtureCanonico = JSON.parse(readFileSync(canonicoPath, 'utf-8'));
const speakersV3Path = path.join(__dirname, 'fixtures', 'apu04', 'caso-001-speakers-v3.json');
const fixtureSpeakersV3 = JSON.parse(readFileSync(speakersV3Path, 'utf-8'));

// --- schema-validator.js -----------------------------------------------------

test('acepta el fixture canónico caso-001-canonico.json sin errores', () => {
  const result = validateCleanInput(fixtureCanonico);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.errors, []);
});

test('rechaza un JSON de entrada sin segments[]', () => {
  const input = structuredClone(fixtureCanonico);
  delete input.segments;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('segments')));
});

test('BUGFIX regresión: acepta un segmento con end === start (duración cero, ruido normal de ASR) sin bloquear el archivo completo', () => {
  // Antes: un solo segmento con timestamps iguales (común en ASR/diarización,
  // p. ej. "seg-048" reportado por un usuario real) tiraba TODO el archivo con
  // un error fatal, aunque telemetry.js ya maneja este caso de forma
  // defensiva marcando solo ese segmento como anómalo (docs/DECISIONS.md).
  const input = structuredClone(fixtureCanonico);
  input.segments[0].end = input.segments[0].start;
  const result = validateCleanInput(input);
  assert.equal(result.valid, true, `No debería bloquear el archivo: ${JSON.stringify(result.errors)}`);
});

test('rechaza un segmento con end < start (datos incoherentes, imposibles de interpretar)', () => {
  const input = structuredClone(fixtureCanonico);
  input.segments[0].end = input.segments[0].start - 1;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('no puede ser menor que')));
});

test('acepta covariateProject/covariateSchema en null (passthrough agnóstico, Regla 1)', () => {
  const input = structuredClone(fixtureCanonico);
  input.covariateProject = null;
  input.covariateSchema = null;
  const result = validateCleanInput(input);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
});

test('acepta speakers[].covariates vacío ({}) sin exigir claves fijas (Regla 1)', () => {
  const input = structuredClone(fixtureCanonico);
  input.speakers[0].covariates = {};
  const result = validateCleanInput(input);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
});

test('rechaza segmentId duplicado', () => {
  const input = structuredClone(fixtureCanonico);
  input.segments[1].segmentId = input.segments[0].segmentId;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('duplicado')));
});

test('rechaza speakerId de segmento que no corresponde a ningún hablante declarado', () => {
  const input = structuredClone(fixtureCanonico);
  input.segments[0].speakerId = 'spk-fantasma';
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('no corresponde a ningún hablante')));
});

test('rechaza id de hablante duplicado', () => {
  const input = structuredClone(fixtureCanonico);
  input.speakers.push({ id: input.speakers[0].id, label: 'Duplicado', covariates: {} });
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('duplicado')));
});

// --- ingest-adapter.js --------------------------------------------------------

test('adaptSpeakersOutput mapea segments[].id -> segmentId y produce entrada válida', () => {
  const adapted = adaptSpeakersOutput(fixtureSpeakersV3, { sourceSession: 'test-session' });
  const result = validateCleanInput(adapted);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
  assert.equal(adapted.segments[0].segmentId, 'seg-001');
  assert.equal('id' in adapted.segments[0], false);
});

test('adaptSpeakersOutput preserva start/end/speakerId/speaker sin modificar', () => {
  const adapted = adaptSpeakersOutput(fixtureSpeakersV3, {});
  const original = fixtureSpeakersV3.segments[1];
  const mapped = adapted.segments[1];
  assert.equal(mapped.start, original.start);
  assert.equal(mapped.end, original.end);
  assert.equal(mapped.speakerId, original.speakerId);
  assert.equal(mapped.speaker, original.speaker);
});

test('adaptSpeakersOutput conserva speakers[]/covariateProject/covariateSchema intactos (passthrough, Regla 1)', () => {
  const adapted = adaptSpeakersOutput(fixtureSpeakersV3, {});
  assert.deepEqual(adapted.speakers, fixtureSpeakersV3.speakers);
  assert.deepEqual(adapted.covariateProject, fixtureSpeakersV3.covariateProject);
  assert.deepEqual(adapted.covariateSchema, fixtureSpeakersV3.covariateSchema);
});

test('adaptSpeakersOutput acepta covariateProject/covariateSchema ausentes (null) sin bloquear (Regla 1: cero bloqueo por VarOps ausente)', () => {
  const withoutVarOps = structuredClone(fixtureSpeakersV3);
  delete withoutVarOps.covariateProject;
  delete withoutVarOps.covariateSchema;
  const adapted = adaptSpeakersOutput(withoutVarOps, {});
  assert.equal(adapted.covariateProject, null);
  assert.equal(adapted.covariateSchema, null);
  const result = validateCleanInput(adapted);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
});

test('adaptSpeakersOutput acepta speakers[] con covariates vacío sin exigir claves fijas', () => {
  const noCovariates = structuredClone(fixtureSpeakersV3);
  noCovariates.speakers.forEach((s) => delete s.covariates);
  const adapted = adaptSpeakersOutput(noCovariates, {});
  adapted.speakers.forEach((s) => assert.deepEqual(s.covariates, {}));
});

test('adaptSpeakersOutput rechaza un archivo sin segments[]', () => {
  assert.throws(() => adaptSpeakersOutput({ speakers: [] }, {}), /segments/);
});

test('adaptSpeakersOutput rechaza una entrada no-objeto', () => {
  assert.throws(() => adaptSpeakersOutput(null, {}), /no se pudo leer/i);
});
