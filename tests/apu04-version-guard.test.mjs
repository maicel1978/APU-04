/**
 * Cubre: src/core/version-guard.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkInputSchemaVersion,
  checkOutputSchemaVersion,
  SUPPORTED_INPUT_SCHEMA_VERSION,
  SUPPORTED_OUTPUT_SCHEMA_VERSION,
} from '../src/core/version-guard.js';

test('checkInputSchemaVersion acepta la versión de entrada soportada (3.0.0, APU-03)', () => {
  const result = checkInputSchemaVersion({ schemaVersion: SUPPORTED_INPUT_SCHEMA_VERSION });
  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

test('checkOutputSchemaVersion acepta la versión de salida soportada (5.0.0, APU-04)', () => {
  const result = checkOutputSchemaVersion({ schemaVersion: SUPPORTED_OUTPUT_SCHEMA_VERSION });
  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

test('las versiones de entrada y salida son números independientes (no deben confundirse)', () => {
  assert.notEqual(SUPPORTED_INPUT_SCHEMA_VERSION, SUPPORTED_OUTPUT_SCHEMA_VERSION);
  // Un documento de salida (5.0.0) no debe pasar la verificación de entrada, y viceversa.
  assert.equal(checkInputSchemaVersion({ schemaVersion: SUPPORTED_OUTPUT_SCHEMA_VERSION }).ok, false);
  assert.equal(checkOutputSchemaVersion({ schemaVersion: SUPPORTED_INPUT_SCHEMA_VERSION }).ok, false);
});

test('checkInputSchemaVersion rechaza una versión distinta con mensaje claro en español', () => {
  const result = checkInputSchemaVersion({ schemaVersion: '2.0.0' });
  assert.equal(result.ok, false);
  assert.match(result.message, /esquema/);
  assert.equal(result.foundVersion, '2.0.0');
});

test('checkOutputSchemaVersion rechaza un documento sin schemaVersion', () => {
  const result = checkOutputSchemaVersion({ foo: 'bar' });
  assert.equal(result.ok, false);
  assert.match(result.message, /no declara/);
});

test('checkInputSchemaVersion/checkOutputSchemaVersion nunca lanzan ante entradas inválidas (null, undefined, no-objeto)', () => {
  assert.doesNotThrow(() => checkInputSchemaVersion(null));
  assert.doesNotThrow(() => checkOutputSchemaVersion(undefined));
  assert.doesNotThrow(() => checkInputSchemaVersion('texto'));
  assert.equal(checkInputSchemaVersion(null).ok, false);
  assert.equal(checkOutputSchemaVersion(null).ok, false);
});
