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
const fixturePath = path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json');
const fixtureEntrada = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// --- schema-validator.js ---------------------------------------------------

test('acepta el fixture canónico caso-001-entrada.json sin errores', () => {
  const result = validateCleanInput(fixtureEntrada);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.errors, []);
});

test('rechaza un JSON de entrada sin segments[]', () => {
  const input = structuredClone(fixtureEntrada);
  delete input.segments;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('segments')));
});

test('rechaza un segmento con end <= start', () => {
  const input = structuredClone(fixtureEntrada);
  input.segments[0].end = input.segments[0].start; // end == start, inválido
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('debe ser mayor que')));
});

test('rechaza covariates con una clave faltante (omitida, no null)', () => {
  const input = structuredClone(fixtureEntrada);
  delete input.covariates.age; // omitir la clave, no poner null
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('covariates.age')));
});

test('acepta covariates con null explícito en una clave (no es lo mismo que omitirla)', () => {
  const input = structuredClone(fixtureEntrada);
  input.covariates.diagnosis = null; // null explícito: válido según API-CONTRACTS.md §3
  const result = validateCleanInput(input);
  assert.equal(result.valid, true, `Errores inesperados: ${JSON.stringify(result.errors)}`);
});

test('rechaza segmentId duplicado', () => {
  const input = structuredClone(fixtureEntrada);
  input.segments[1].segmentId = input.segments[0].segmentId;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('duplicado')));
});

test('rechaza un segmento que use "id" en vez de "segmentId" (no es el contrato canónico)', () => {
  const input = structuredClone(fixtureEntrada);
  input.segments[0].id = input.segments[0].segmentId;
  delete input.segments[0].segmentId;
  const result = validateCleanInput(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('segmentId')));
});

// --- ingest-adapter.js (id -> segmentId) -----------------------------------

test('adapta speakers.json (APU-03, campo "id") al contrato canónico (segmentId)', () => {
  // Se deriva mecánicamente del fixture aprobado caso-001-entrada.json,
  // simulando la forma real de salida de APU-03 (docs/CONTRACTS.md §5):
  // segmentId -> id, y sin studyId/covariates/sourceRefs (los aporta el formulario).
  const speakersJson = {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-03',
    stage: 'speaker-segmentation',
    speakers: [
      { id: 'spk-1', label: 'Entrevistador' },
      { id: 'spk-2', label: 'Participante' },
    ],
    segments: fixtureEntrada.segments.map((s) => ({
      id: s.segmentId,
      speakerId: s.speakerId,
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };

  const formData = {
    studyId: fixtureEntrada.studyId,
    covariates: fixtureEntrada.covariates,
    sourceRefs: fixtureEntrada.sourceRefs,
  };

  const adapted = adaptSpeakersOutput(speakersJson, formData);

  // El resultado adaptado debe pasar el validador del contrato canónico.
  const validation = validateCleanInput(adapted);
  assert.equal(validation.valid, true, `Errores inesperados: ${JSON.stringify(validation.errors)}`);

  // El mapeo id -> segmentId debe preservar el valor y el orden.
  assert.equal(adapted.segments.length, fixtureEntrada.segments.length);
  adapted.segments.forEach((seg, i) => {
    assert.equal(seg.segmentId, fixtureEntrada.segments[i].segmentId);
    assert.equal(seg.text, fixtureEntrada.segments[i].text);
    assert.equal(seg.start, fixtureEntrada.segments[i].start);
    assert.equal(seg.end, fixtureEntrada.segments[i].end);
    assert.equal(seg.speakerId, fixtureEntrada.segments[i].speakerId);
    // El adaptador no debe dejar el campo "id" residual en la salida.
    assert.equal('id' in seg, false);
  });

  // confidence ausente en APU-03 -> null explícito, no omitido.
  assert.equal(adapted.segments[0].confidence, null);
});

test('el adaptador completa covariates/sourceRefs con null explícito si faltan claves', () => {
  const speakersJson = {
    segments: [
      { id: 'seg-x', speakerId: 'spk-1', start: 0, end: 1, text: 'hola' },
    ],
  };
  const formData = { studyId: 'estudio-x', covariates: { caseId: 'c1' }, sourceRefs: {} };

  const adapted = adaptSpeakersOutput(speakersJson, formData);

  assert.equal(adapted.covariates.caseId, 'c1');
  assert.equal(adapted.covariates.age, null); // faltaba, debe quedar null explícito
  assert.equal('age' in adapted.covariates, true); // la clave debe existir, no estar omitida
  assert.equal(adapted.sourceRefs.sourceAudioFileName, null);
  assert.equal('sourceAudioFileName' in adapted.sourceRefs, true);
});
