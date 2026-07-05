/**
 * Cubre: src/core/term-frequency.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeTermFrequency } from '../src/core/term-frequency.js';

function seg(text) {
  return { cleanedText: text };
}

test('cuenta palabras repetidas por encima del umbral mínimo', () => {
  const segments = [
    seg('El paciente sufrió un infarto agudo de miocardio.'),
    seg('El infarto fue tratado a tiempo.'),
    seg('El infarto no dejó secuelas.'),
  ];
  const result = computeTermFrequency(segments, { minCount: 2 });
  const infarto = result.words.find((w) => w.term === 'infarto');
  assert.ok(infarto, 'debe aparecer "infarto" en la lista');
  assert.equal(infarto.count, 3);
});

test('excluye palabras funcionales (stopwords) de la lista', () => {
  const segments = [seg('el paciente y el médico hablaron con el paciente')];
  const result = computeTermFrequency(segments, { minCount: 1 });
  assert.equal(result.words.some((w) => w.term === 'el'), false);
  assert.equal(result.words.some((w) => w.term === 'y'), false);
});

test('excluye palabras más cortas que minLength', () => {
  const segments = [seg('el ir ir ir fue muy largo')];
  const result = computeTermFrequency(segments, { minCount: 1, minLength: 3 });
  assert.equal(result.words.some((w) => w.term === 'ir'), false);
});

test('detecta bigramas frecuentes (frases de dos palabras)', () => {
  const segments = [
    seg('presenta ataque cardiaco severo'),
    seg('otro ataque cardiaco fue registrado'),
  ];
  const result = computeTermFrequency(segments, { minCount: 2 });
  const bigram = result.bigrams.find((b) => b.term === 'ataque cardiaco');
  assert.ok(bigram, 'debe detectar el bigrama "ataque cardiaco"');
  assert.equal(bigram.count, 2);
});

test('respeta topN, devolviendo como máximo esa cantidad', () => {
  const segments = [seg('alfa beta gamma delta epsilon alfa beta gamma delta epsilon alfa beta gamma delta epsilon')];
  const result = computeTermFrequency(segments, { minCount: 1, topN: 2 });
  assert.ok(result.words.length <= 2);
});

test('ordena de mayor a menor frecuencia', () => {
  const segments = [seg('gato gato gato perro perro pajaro')];
  const result = computeTermFrequency(segments, { minCount: 1 });
  const counts = result.words.map((w) => w.count);
  const sorted = [...counts].sort((a, b) => b - a);
  assert.deepEqual(counts, sorted);
});

test('maneja lote vacío o sin texto sin lanzar (defensivo, R6)', () => {
  assert.doesNotThrow(() => computeTermFrequency([]));
  assert.doesNotThrow(() => computeTermFrequency(null));
  assert.doesNotThrow(() => computeTermFrequency([{ cleanedText: '' }]));
  const result = computeTermFrequency(null);
  assert.deepEqual(result.words, []);
  assert.deepEqual(result.bigrams, []);
});

test('funciona con segmentos de varios archivos concatenados (uso previsto: todo el lote)', () => {
  const archivoA = [seg('el paciente tiene diabetes'), seg('la diabetes fue diagnosticada')];
  const archivoB = [seg('otro paciente con diabetes también')];
  const result = computeTermFrequency([...archivoA, ...archivoB], { minCount: 2 });
  const diabetes = result.words.find((w) => w.term === 'diabetes');
  assert.equal(diabetes.count, 3);
});
