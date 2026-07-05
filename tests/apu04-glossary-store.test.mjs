/**
 * Cubre: src/core/glossary-store.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGlossaryStore, mergeGlossaryEntries } from '../src/core/glossary-store.js';

function createInMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

// --- createGlossaryStore -------------------------------------------------

test('loadOverrides devuelve [] si no hay nada guardado', () => {
  const store = createGlossaryStore(createInMemoryStorage());
  assert.deepEqual(store.loadOverrides(), []);
});

test('saveOverrides/loadOverrides son inversas', () => {
  const store = createGlossaryStore(createInMemoryStorage());
  const entries = [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }];
  store.saveOverrides(entries);
  assert.deepEqual(store.loadOverrides(), entries);
});

test('clearOverrides elimina las entradas guardadas', () => {
  const store = createGlossaryStore(createInMemoryStorage());
  store.saveOverrides([{ wrong: 'x', correct: 'y' }]);
  store.clearOverrides();
  assert.deepEqual(store.loadOverrides(), []);
});

test('loadOverrides no lanza ante datos corruptos en el almacenamiento (defensivo, R6)', () => {
  const storage = createInMemoryStorage();
  storage.setItem('apu04_glossary_overrides', '{ esto no es json');
  const store = createGlossaryStore(storage);
  assert.doesNotThrow(() => store.loadOverrides());
  assert.deepEqual(store.loadOverrides(), []);
});

test('saveOverrides rechaza una entrada que no es una lista', () => {
  const store = createGlossaryStore(createInMemoryStorage());
  assert.throws(() => store.saveOverrides('no es una lista'), /lista/);
});

// --- mergeGlossaryEntries --------------------------------------------------

test('mergeGlossaryEntries agrega entradas nuevas sin duplicar el resto', () => {
  const base = [{ wrong: 'redacción logística', correct: 'regresión logística' }];
  const overrides = [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }];
  const merged = mergeGlossaryEntries(base, overrides);
  assert.equal(merged.length, 2);
});

test('mergeGlossaryEntries reemplaza una entrada base con el mismo "wrong" (insensible a mayúsculas)', () => {
  const base = [{ wrong: 'IAM', correct: 'texto viejo', exact: true }];
  const overrides = [{ wrong: 'iam', correct: 'infarto agudo de miocardio', exact: true }];
  const merged = mergeGlossaryEntries(base, overrides);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].correct, 'infarto agudo de miocardio');
});

test('mergeGlossaryEntries maneja entradas base/overrides vacías o no-array sin lanzar', () => {
  assert.doesNotThrow(() => mergeGlossaryEntries(null, null));
  assert.deepEqual(mergeGlossaryEntries(null, null), []);
  assert.deepEqual(mergeGlossaryEntries([{ wrong: 'a', correct: 'b' }], null), [{ wrong: 'a', correct: 'b' }]);
});
