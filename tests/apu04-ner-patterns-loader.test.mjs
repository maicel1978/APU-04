/**
 * Cubre: src/core/ner-patterns-loader.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { hydrateNerPatterns } from '../src/core/ner-patterns-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);

test('hydrateNerPatterns completa la lista manual de nombres sin inferirla', () => {
  const result = hydrateNerPatterns(template, { manualNames: ['Juan Pérez', 'juan pérez', 'Ana Ruiz'] });
  const nameMatcher = result.listMatchers.find((m) => m.source === 'manual-nombres');
  assert.deepEqual(nameMatcher.values, ['Juan Pérez', 'Ana Ruiz']);
});

test('hydrateNerPatterns completa la lista manual de hospitales/sitios', () => {
  const result = hydrateNerPatterns(template, { manualHospitals: ['Hospital Central'] });
  const hospitalMatcher = result.listMatchers.find((m) => m.source === 'manual-hospitales');
  assert.deepEqual(hospitalMatcher.values, ['Hospital Central']);
});

test('hydrateNerPatterns completa la lista manual de direcciones', () => {
  const result = hydrateNerPatterns(template, { manualAddresses: ['Calle Falsa 123'] });
  const addressMatcher = result.listMatchers.find((m) => m.source === 'manual-direcciones');
  assert.deepEqual(addressMatcher.values, ['Calle Falsa 123']);
});

test('hydrateNerPatterns deja listMatchers vacíos si no se provee ningún valor en runtime', () => {
  const result = hydrateNerPatterns(template, {});
  for (const matcher of result.listMatchers) {
    assert.deepEqual(matcher.values, []);
  }
});

test('hydrateNerPatterns no muta la plantilla original', () => {
  const before = JSON.stringify(template);
  hydrateNerPatterns(template, { manualNames: ['Y'] });
  assert.equal(JSON.stringify(template), before);
});

test('hydrateNerPatterns conserva regexPatterns intactos', () => {
  const result = hydrateNerPatterns(template, {});
  assert.deepEqual(result.regexPatterns, template.regexPatterns);
});

test('hydrateNerPatterns rechaza una plantilla inválida', () => {
  assert.throws(() => hydrateNerPatterns(null, {}), /formato válido/);
});
