/**
 * Cubre: src/core/pii-relational-engine.js (en aislamiento, sin pasar por
 * clean-pipeline.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createPiiRelationalMasker } from '../src/core/pii-relational-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nerPatternsBase = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);

test('maskSegment asigna [PERSONA_1] y [PERSONA_2] a dos personas distintas en orden de aparición', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez', 'ana ruiz'];
  const masker = createPiiRelationalMasker();

  const r1 = masker.maskSegment('seg-001', 'Hoy vino juan perez a la consulta.', nerPatterns);
  const r2 = masker.maskSegment('seg-002', 'También llamó ana ruiz por teléfono.', nerPatterns);

  assert.match(r1.cleanedText, /\[PERSONA_1\]/);
  assert.match(r2.cleanedText, /\[PERSONA_2\]/);
});

test('maskSegment reutiliza el mismo índice para la misma persona en distintos segmentos, insensible a mayúsculas', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  const masker = createPiiRelationalMasker();

  const r1 = masker.maskSegment('seg-001', 'Aquí está juan perez.', nerPatterns);
  const r2 = masker.maskSegment('seg-002', 'De nuevo JUAN PEREZ llegó tarde.', nerPatterns);

  assert.match(r1.cleanedText, /\[PERSONA_1\]/);
  assert.match(r2.cleanedText, /\[PERSONA_1\]/);
});

test('getEntityMap agrupa todas las ocurrencias de una entidad por segmentId', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  const masker = createPiiRelationalMasker();
  masker.maskSegment('seg-001', 'juan perez habló.', nerPatterns);
  masker.maskSegment('seg-002', 'juan perez volvió a hablar.', nerPatterns);

  const entityMap = masker.getEntityMap();
  const entry = entityMap['[PERSONA_1]'];
  assert.equal(entry.canonicalValue.toLowerCase(), 'juan perez');
  assert.deepEqual(entry.occurrences, ['seg-001', 'seg-002']);
});

test('categorías distintas (PERSONA vs HOSPITAL) llevan contadores independientes', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];
  const masker = createPiiRelationalMasker();

  const result = masker.maskSegment('seg-001', 'juan perez fue al hospital central.', nerPatterns);
  assert.match(result.cleanedText, /\[PERSONA_1\]/);
  assert.match(result.cleanedText, /\[HOSPITAL_1\]/);
});

test('FECHA no se indexa (categoría no listada en CATEGORY_BY_LABEL): mantiene el placeholder plano', () => {
  const masker = createPiiRelationalMasker();
  const result = masker.maskSegment('seg-001', 'La cita fue el 12/05/2023.', nerPatternsBase);
  assert.match(result.cleanedText, /\[FECHA\]/);
  assert.equal(result.cleanedText.includes('[FECHA_1]'), false);
});

test('maskSegment nunca expone el valor real en hits (solo placeholder)', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  const masker = createPiiRelationalMasker();
  const result = masker.maskSegment('seg-001', 'juan perez llegó.', nerPatterns);
  for (const hit of result.hits) {
    assert.equal('originalValue' in hit, false);
  }
});

test('maskSegment rechaza un segmentId inválido', () => {
  const masker = createPiiRelationalMasker();
  assert.throws(() => masker.maskSegment('', 'texto', nerPatternsBase), /identificador válido/);
  assert.throws(() => masker.maskSegment(null, 'texto', nerPatternsBase), /identificador válido/);
});
