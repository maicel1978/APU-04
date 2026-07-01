/**
 * Cubre: src/core/version-guard.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSchemaVersion, SUPPORTED_SCHEMA_VERSION } from '../src/core/version-guard.js';

test('checkSchemaVersion acepta la versión soportada', () => {
  const result = checkSchemaVersion({ schemaVersion: SUPPORTED_SCHEMA_VERSION });
  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

test('checkSchemaVersion rechaza una versión distinta con mensaje claro en español', () => {
  const result = checkSchemaVersion({ schemaVersion: '2.0.0' });
  assert.equal(result.ok, false);
  assert.match(result.message, /esquema/);
  assert.equal(result.foundVersion, '2.0.0');
});

test('checkSchemaVersion rechaza un documento sin schemaVersion', () => {
  const result = checkSchemaVersion({ foo: 'bar' });
  assert.equal(result.ok, false);
  assert.match(result.message, /no declara/);
});

test('checkSchemaVersion nunca lanza ante entradas inválidas (null, undefined, no-objeto)', () => {
  assert.doesNotThrow(() => checkSchemaVersion(null));
  assert.doesNotThrow(() => checkSchemaVersion(undefined));
  assert.doesNotThrow(() => checkSchemaVersion('texto'));
  assert.equal(checkSchemaVersion(null).ok, false);
});
