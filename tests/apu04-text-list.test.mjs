/**
 * Cubre: src/utils/text-list.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFreeTextList, dedupeList } from '../src/utils/text-list.js';

test('parseFreeTextList separa por líneas y por comas', () => {
  const result = parseFreeTextList('Juan Pérez\nMaría López, Ana Ruiz');
  assert.deepEqual(result, ['Juan Pérez', 'María López', 'Ana Ruiz']);
});

test('parseFreeTextList descarta entradas vacías y recorta espacios', () => {
  const result = parseFreeTextList('  Juan Pérez  \n\n , , María López ');
  assert.deepEqual(result, ['Juan Pérez', 'María López']);
});

test('parseFreeTextList devuelve lista vacía para texto vacío, null o no-string', () => {
  assert.deepEqual(parseFreeTextList(''), []);
  assert.deepEqual(parseFreeTextList('   '), []);
  assert.deepEqual(parseFreeTextList(null), []);
  assert.deepEqual(parseFreeTextList(undefined), []);
});

test('dedupeList elimina duplicados insensible a mayúsculas/minúsculas en español, conserva el primero', () => {
  const result = dedupeList(['Juan Pérez', 'juan pérez', 'JUAN PÉREZ', 'Ana']);
  assert.deepEqual(result, ['Juan Pérez', 'Ana']);
});

test('dedupeList maneja entradas no-array devolviendo lista vacía', () => {
  assert.deepEqual(dedupeList(null), []);
  assert.deepEqual(dedupeList(undefined), []);
});
