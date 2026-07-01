/**
 * Cubre: src/utils/word-diff.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeWordDiff } from '../src/utils/word-diff.js';

test('computeWordDiff marca como "equal" las palabras idénticas en medio de un cambio, en vez de removed+added', () => {
  // Caso real detectado en revisión visual: en "silencio eh no se" -> "Silencio eh no se.",
  // las palabras intermedias "eh" y "no" no cambian en absoluto y deben quedar "equal",
  // a diferencia de buildChangeHighlight (comparación por conjunto) que las
  // excluía silenciosamente de la vista sin marcarlas como parte del texto sin cambios.
  const diff = computeWordDiff('silencio eh no se', 'Silencio eh no se.');
  const equalText = diff.filter((d) => d.type === 'equal').map((d) => d.text).join(' ');
  assert.equal(equalText, 'eh no');
});

test('computeWordDiff no marca como "removed" ninguna palabra que sí sobrevive sin cambios en after', () => {
  const diff = computeWordDiff('esto es una prueba de habla', 'Esto es una prueba de habla.');
  const removedWords = diff.filter((d) => d.type === 'removed').flatMap((d) => d.text.split(' '));
  // "esto" (mayúscula distinta) y "habla" (con punto final agregado) son tokens
  // literalmente distintos y por tanto cambian; el resto ("es una prueba de")
  // debe quedar "equal", sin marcarse falsamente como removido.
  assert.deepEqual(removedWords.sort(), ['esto', 'habla'].sort());
  const equalText = diff.filter((d) => d.type === 'equal').map((d) => d.text).join(' ');
  assert.equal(equalText, 'es una prueba de');
});

test('computeWordDiff reconstruye el texto completo (equal+removed en el orden de before)', () => {
  const diff = computeWordDiff('el gato come pescado', 'el perro come pescado');
  const reconstructedBefore = diff.filter((d) => d.type !== 'added').map((d) => d.text).join(' ');
  assert.equal(reconstructedBefore, 'el gato come pescado');
});

test('computeWordDiff reconstruye el texto after (equal+added en su orden)', () => {
  const diff = computeWordDiff('el gato come pescado', 'el perro come pescado');
  const reconstructedAfter = diff.filter((d) => d.type !== 'removed').map((d) => d.text).join(' ');
  assert.equal(reconstructedAfter, 'el perro come pescado');
});

test('computeWordDiff detecta una sustitución simple como removed+added, no como texto genérico', () => {
  const diff = computeWordDiff('la redacción logística mostró un buen ajuste', 'La regresión logística mostró un buen ajuste.');
  const types = diff.map((d) => d.type);
  assert.ok(types.includes('removed'));
  assert.ok(types.includes('added'));
  assert.ok(types.includes('equal'));
});

test('computeWordDiff devuelve solo "equal" si los textos son idénticos', () => {
  const diff = computeWordDiff('hola mundo', 'hola mundo');
  assert.deepEqual(diff, [{ type: 'equal', text: 'hola mundo' }]);
});

test('computeWordDiff maneja before vacío (todo el after es "added")', () => {
  const diff = computeWordDiff('', 'texto nuevo');
  assert.deepEqual(diff, [{ type: 'added', text: 'texto nuevo' }]);
});

test('computeWordDiff maneja after vacío (todo el before es "removed")', () => {
  const diff = computeWordDiff('texto viejo', '');
  assert.deepEqual(diff, [{ type: 'removed', text: 'texto viejo' }]);
});

test('computeWordDiff maneja ambos vacíos sin lanzar', () => {
  assert.deepEqual(computeWordDiff('', ''), []);
});

test('computeWordDiff maneja entradas no-string sin lanzar (defensivo)', () => {
  assert.doesNotThrow(() => computeWordDiff(null, undefined));
});
