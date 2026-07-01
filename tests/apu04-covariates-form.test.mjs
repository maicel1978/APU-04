/**
 * Cubre: src/ui/covariates-form.js — solo la lógica pura
 * (normalizeFormValues, validateCovariatesForm). El renderizado DOM se
 * prueba por separado con jsdom en tests/apu04-*.dom.test.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFormValues, validateCovariatesForm } from '../src/ui/covariates-form.js';

test('normalizeFormValues convierte age a número y deja null explícito si está vacío', () => {
  const result = normalizeFormValues({
    studyId: 'estudio-x',
    caseId: 'caso-1',
    group: 'intervencion',
    moment: 'pre',
    sex: 'F',
    age: '34',
    site: 'Hospital Central',
    diagnosis: 'Ansiedad',
  });

  assert.equal(result.studyId, 'estudio-x');
  assert.equal(result.covariates.age, 34);
  assert.equal(typeof result.covariates.age, 'number');
});

test('normalizeFormValues usa null explícito para campos vacíos, nunca omite la clave', () => {
  const result = normalizeFormValues({ studyId: '', caseId: '', group: '', moment: '', sex: '', age: '', site: '', diagnosis: '' });

  assert.equal(result.studyId, null);
  for (const key of ['caseId', 'group', 'moment', 'sex', 'age', 'site', 'diagnosis']) {
    assert.equal(key in result.covariates, true, `covariates.${key} debe existir aunque sea null`);
    assert.equal(result.covariates[key], null);
  }
});

test('normalizeFormValues maneja un objeto de entrada vacío o inválido sin lanzar error', () => {
  const result = normalizeFormValues(undefined);
  assert.equal(result.studyId, null);
  assert.equal(result.covariates.age, null);
});

test('normalizeFormValues descarta un valor de age no numérico como null', () => {
  const result = normalizeFormValues({ age: 'no-es-un-numero' });
  assert.equal(result.covariates.age, null);
});

test('validateCovariatesForm no bloquea nunca (siempre devuelve solo advertencias, nunca lanza)', () => {
  const normalized = normalizeFormValues({});
  const warnings = validateCovariatesForm(normalized);
  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.length > 0); // hay varios campos vacíos, deben generar advertencia
});

test('validateCovariatesForm advierte edad fuera de rango plausible (negativa o > 120)', () => {
  const negative = validateCovariatesForm(normalizeFormValues({ age: '-5' }));
  const tooOld = validateCovariatesForm(normalizeFormValues({ age: '150' }));
  assert.ok(negative.some((w) => w.includes('edad')));
  assert.ok(tooOld.some((w) => w.includes('edad')));
});

test('validateCovariatesForm no advierte edad si está dentro de rango plausible', () => {
  const warnings = validateCovariatesForm(
    normalizeFormValues({ studyId: 'e1', group: 'control', moment: 'post', age: '40' }),
  );
  assert.equal(warnings.some((w) => w.includes('edad')), false);
});

test('validateCovariatesForm advierte si group o moment quedan vacíos, sin bloquear', () => {
  const warnings = validateCovariatesForm(normalizeFormValues({ studyId: 'e1', age: '40' }));
  assert.ok(warnings.some((w) => w.includes('Grupo')));
  assert.ok(warnings.some((w) => w.includes('Momento')));
});
