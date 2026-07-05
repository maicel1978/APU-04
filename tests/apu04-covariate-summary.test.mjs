/**
 * Cubre: src/core/covariate-summary.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectCovariateBreakdown,
  mergeCovariateBreakdowns,
  collectCovariateOptions,
  formatSpeakerCovariateLabel,
} from '../src/core/covariate-summary.js';

const speakers = [
  { id: 'spk-1', label: 'Entrevistador', covariates: {} },
  { id: 'spk-2', label: 'Paciente A', covariates: { grupo_estudio: 'Intervención', sitio: 'Hospital Central' } },
  { id: 'spk-3', label: 'Paciente B', covariates: { grupo_estudio: 'Control' } },
];

function seg(speakerId) {
  return { speakerId };
}

// --- collectCovariateBreakdown ------------------------------------------

test('cuenta segmentos por valor de cada covariable', () => {
  const segments = [seg('spk-2'), seg('spk-2'), seg('spk-3'), seg('spk-1')];
  const breakdown = collectCovariateBreakdown(segments, speakers);
  assert.deepEqual(breakdown.grupo_estudio, { 'Intervención': 2, 'Control': 1 });
  assert.deepEqual(breakdown.sitio, { 'Hospital Central': 2 });
});

test('ignora segmentos cuyo hablante no tiene covariables (spk-1)', () => {
  const segments = [seg('spk-1')];
  const breakdown = collectCovariateBreakdown(segments, speakers);
  assert.deepEqual(breakdown, {});
});

test('maneja segmentos/speakers vacíos o inválidos sin lanzar (defensivo, R6)', () => {
  assert.doesNotThrow(() => collectCovariateBreakdown([], []));
  assert.doesNotThrow(() => collectCovariateBreakdown(null, null));
  assert.deepEqual(collectCovariateBreakdown(null, null), {});
});

// --- mergeCovariateBreakdowns --------------------------------------------

test('suma conteos de varios archivos del lote', () => {
  const a = { grupo_estudio: { 'Intervención': 2 } };
  const b = { grupo_estudio: { 'Intervención': 1, 'Control': 3 } };
  const merged = mergeCovariateBreakdowns([a, b]);
  assert.deepEqual(merged.grupo_estudio, { 'Intervención': 3, 'Control': 3 });
});

test('maneja lista vacía o con entradas nulas sin lanzar', () => {
  assert.doesNotThrow(() => mergeCovariateBreakdowns([]));
  assert.doesNotThrow(() => mergeCovariateBreakdowns([null, undefined]));
  assert.deepEqual(mergeCovariateBreakdowns([null]), {});
});

// --- collectCovariateOptions ----------------------------------------------

test('deriva combinaciones clave/valor distintas para el filtro', () => {
  const options = collectCovariateOptions(speakers);
  assert.deepEqual(options, [
    { key: 'grupo_estudio', value: 'Intervención', label: 'grupo_estudio: Intervención' },
    { key: 'sitio', value: 'Hospital Central', label: 'sitio: Hospital Central' },
    { key: 'grupo_estudio', value: 'Control', label: 'grupo_estudio: Control' },
  ]);
});

test('no duplica una misma combinación clave/valor repetida entre hablantes', () => {
  const repeated = [
    { id: 'a', covariates: { grupo: 'X' } },
    { id: 'b', covariates: { grupo: 'X' } },
  ];
  const options = collectCovariateOptions(repeated);
  assert.equal(options.length, 1);
});

// --- formatSpeakerCovariateLabel --------------------------------------------

test('formatea las covariables de un hablante como etiqueta legible', () => {
  const label = formatSpeakerCovariateLabel('spk-2', speakers);
  assert.equal(label, 'grupo_estudio: Intervención · sitio: Hospital Central');
});

test('devuelve null si el hablante no tiene covariables', () => {
  assert.equal(formatSpeakerCovariateLabel('spk-1', speakers), null);
});

test('devuelve null si el hablante no existe', () => {
  assert.equal(formatSpeakerCovariateLabel('spk-inexistente', speakers), null);
});

// --- regresión: covariables ausentes/parciales no deben provocar problemas
// (el archivo puede o no traer covariables; nunca debe ser obligatorio) ------

test('covariates: null explícito (no {}) se trata igual que ausente, sin lanzar', () => {
  const speakersNullCovariates = [{ id: 'spk-1', covariates: null }];
  const segments = [seg('spk-1')];
  assert.doesNotThrow(() => collectCovariateBreakdown(segments, speakersNullCovariates));
  assert.deepEqual(collectCovariateBreakdown(segments, speakersNullCovariates), {});
  assert.deepEqual(collectCovariateOptions(speakersNullCovariates), []);
  assert.equal(formatSpeakerCovariateLabel('spk-1', speakersNullCovariates), null);
});

test('un hablante sin la clave "covariates" del todo (no viene en el archivo) no rompe nada', () => {
  const speakersWithoutKey = [{ id: 'spk-1' }]; // sin "covariates" en absoluto
  const segments = [seg('spk-1')];
  assert.doesNotThrow(() => collectCovariateBreakdown(segments, speakersWithoutKey));
  assert.deepEqual(collectCovariateBreakdown(segments, speakersWithoutKey), {});
  assert.equal(formatSpeakerCovariateLabel('spk-1', speakersWithoutKey), null);
});

test('lote mixto: solo algunos hablantes/archivos traen covariables, el resto se ignora sin lanzar', () => {
  const speakersMixed = [
    { id: 'spk-1', covariates: { grupo: 'A' } },
    { id: 'spk-2' }, // sin covariables
    { id: 'spk-3', covariates: {} }, // covariables vacías
  ];
  const segments = [seg('spk-1'), seg('spk-2'), seg('spk-3')];
  const breakdown = collectCovariateBreakdown(segments, speakersMixed);
  assert.deepEqual(breakdown, { grupo: { A: 1 } });
});

test('un valor null explícito dentro de covariates se omite del resumen, sin lanzar', () => {
  const speakersPartialNull = [{ id: 'spk-1', covariates: { grupo: null, sitio: 'Hospital X' } }];
  const segments = [seg('spk-1')];
  const breakdown = collectCovariateBreakdown(segments, speakersPartialNull);
  assert.deepEqual(breakdown, { sitio: { 'Hospital X': 1 } });
  assert.equal('grupo' in breakdown, false);
});

test('un valor vacío ("") dentro de covariates se omite igual que null', () => {
  const speakersEmptyString = [{ id: 'spk-1', covariates: { grupo: '' } }];
  assert.deepEqual(collectCovariateOptions(speakersEmptyString), []);
});

test('speakers undefined/no-array en cualquier función no lanza (defensivo, R6)', () => {
  assert.doesNotThrow(() => collectCovariateBreakdown([seg('spk-1')], undefined));
  assert.doesNotThrow(() => collectCovariateOptions(undefined));
  assert.doesNotThrow(() => formatSpeakerCovariateLabel('spk-1', undefined));
  assert.deepEqual(collectCovariateOptions(undefined), []);
});
