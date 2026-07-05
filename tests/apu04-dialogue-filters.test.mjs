/**
 * Cubre: src/core/dialogue-filters.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterSegments, collectSpeakersInSegments, isReviewed } from '../src/core/dialogue-filters.js';

function seg(overrides) {
  return {
    segmentId: 's1',
    speakerId: 'spk-1',
    speaker: 'Hablante 1',
    start: 0,
    end: 1,
    cleanedText: 'Texto de prueba.',
    anomalous: false,
    modificationsLog: [],
    ...overrides,
  };
}

test('isReviewed detecta entrada type:"human"', () => {
  assert.equal(isReviewed(seg({ modificationsLog: [] })), false);
  assert.equal(isReviewed(seg({ modificationsLog: [{ type: 'human' }] })), true);
});

test('filterSegments status=all devuelve todos ordenados por start', () => {
  const segments = [seg({ segmentId: 'b', start: 5 }), seg({ segmentId: 'a', start: 1 })];
  const result = filterSegments(segments, { status: 'all' });
  assert.deepEqual(result.map((s) => s.segmentId), ['a', 'b']);
});

test('filterSegments status=pending excluye revisados', () => {
  const segments = [
    seg({ segmentId: 'a', modificationsLog: [{ type: 'human' }] }),
    seg({ segmentId: 'b' }),
  ];
  const result = filterSegments(segments, { status: 'pending' });
  assert.deepEqual(result.map((s) => s.segmentId), ['b']);
});

test('filterSegments status=reviewed incluye solo revisados', () => {
  const segments = [
    seg({ segmentId: 'a', modificationsLog: [{ type: 'human' }] }),
    seg({ segmentId: 'b' }),
  ];
  const result = filterSegments(segments, { status: 'reviewed' });
  assert.deepEqual(result.map((s) => s.segmentId), ['a']);
});

test('filterSegments status=anomalous filtra por anomalous:true', () => {
  const segments = [seg({ segmentId: 'a', anomalous: true }), seg({ segmentId: 'b', anomalous: false })];
  const result = filterSegments(segments, { status: 'anomalous' });
  assert.deepEqual(result.map((s) => s.segmentId), ['a']);
});

test('filterSegments filtra por speakerId', () => {
  const segments = [seg({ segmentId: 'a', speakerId: 'spk-1' }), seg({ segmentId: 'b', speakerId: 'spk-2' })];
  const result = filterSegments(segments, { speakerId: 'spk-2' });
  assert.deepEqual(result.map((s) => s.segmentId), ['b']);
});

test('filterSegments busca por texto, insensible a mayúsculas/acentos de capitalización', () => {
  const segments = [seg({ segmentId: 'a', cleanedText: 'La regresión logística fue significativa.' })];
  assert.equal(filterSegments(segments, { query: 'REGRESIÓN' }).length, 1);
  assert.equal(filterSegments(segments, { query: 'inexistente' }).length, 0);
});

test('filterSegments combina status + speaker + query simultáneamente', () => {
  const segments = [
    seg({ segmentId: 'a', speakerId: 'spk-1', anomalous: true, cleanedText: 'riesgo alto' }),
    seg({ segmentId: 'b', speakerId: 'spk-1', anomalous: true, cleanedText: 'sin relación' }),
    seg({ segmentId: 'c', speakerId: 'spk-2', anomalous: true, cleanedText: 'riesgo alto' }),
  ];
  const result = filterSegments(segments, { status: 'anomalous', speakerId: 'spk-1', query: 'riesgo' });
  assert.deepEqual(result.map((s) => s.segmentId), ['a']);
});

test('filterSegments no muta el array de entrada', () => {
  const segments = [seg({ segmentId: 'b', start: 5 }), seg({ segmentId: 'a', start: 1 })];
  const originalOrder = segments.map((s) => s.segmentId);
  filterSegments(segments, {});
  assert.deepEqual(segments.map((s) => s.segmentId), originalOrder);
});

test('collectSpeakersInSegments deriva la lista de hablantes sin duplicados, en orden de aparición', () => {
  const segments = [
    seg({ speakerId: 'spk-2', speaker: 'Paciente' }),
    seg({ speakerId: 'spk-1', speaker: 'Entrevistador' }),
    seg({ speakerId: 'spk-2', speaker: 'Paciente' }),
  ];
  const result = collectSpeakersInSegments(segments);
  assert.deepEqual(result, [
    { speakerId: 'spk-2', label: 'Paciente' },
    { speakerId: 'spk-1', label: 'Entrevistador' },
  ]);
});

// --- filtro por covariable (mejora 2026-07) ---------------------------------

const speakersWithCovariates = [
  { id: 'spk-1', covariates: { grupo: 'Intervención' } },
  { id: 'spk-2', covariates: { grupo: 'Control' } },
];

test('filterSegments sin covariate (null/ausente) no filtra por covariable', () => {
  const segments = [seg({ segmentId: 'a', speakerId: 'spk-1' }), seg({ segmentId: 'b', speakerId: 'spk-2' })];
  const result = filterSegments(segments, {}, speakersWithCovariates);
  assert.equal(result.length, 2);
});

test('filterSegments filtra por covariable "clave\\u0000valor"', () => {
  const segments = [seg({ segmentId: 'a', speakerId: 'spk-1' }), seg({ segmentId: 'b', speakerId: 'spk-2' })];
  const result = filterSegments(segments, { covariate: 'grupo\u0000Intervención' }, speakersWithCovariates);
  assert.deepEqual(result.map((s) => s.segmentId), ['a']);
});

test('filterSegments con covariate excluye segmentos de hablantes sin esa covariable', () => {
  const speakersMixed = [...speakersWithCovariates, { id: 'spk-3', covariates: {} }];
  const segments = [seg({ segmentId: 'a', speakerId: 'spk-1' }), seg({ segmentId: 'c', speakerId: 'spk-3' })];
  const result = filterSegments(segments, { covariate: 'grupo\u0000Intervención' }, speakersMixed);
  assert.deepEqual(result.map((s) => s.segmentId), ['a']);
});

test('filterSegments combina covariate con status/speaker/query', () => {
  const segments = [
    seg({ segmentId: 'a', speakerId: 'spk-1', anomalous: true, cleanedText: 'riesgo alto' }),
    seg({ segmentId: 'b', speakerId: 'spk-2', anomalous: true, cleanedText: 'riesgo alto' }),
  ];
  const result = filterSegments(segments, { status: 'anomalous', covariate: 'grupo\u0000Control', query: 'riesgo' }, speakersWithCovariates);
  assert.deepEqual(result.map((s) => s.segmentId), ['b']);
});
