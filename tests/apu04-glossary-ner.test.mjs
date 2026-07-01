/**
 * Cubre: src/core/glossary-engine.js, src/core/ner-engine.js,
 * src/core/clean-pipeline.js, src/utils/hash.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { applyGlossary, levenshteinDistance } from '../src/core/glossary-engine.js';
import { applyNerMasking } from '../src/core/ner-engine.js';
import { runCleanPipeline } from '../src/core/clean-pipeline.js';
import { sha256Hex } from '../src/utils/hash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsBase = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

// --- glossary-engine.js: los 4 ejemplos de docs/CONTRACTS.md §2 ---

test('glosario: "redacción logística" -> "regresión logística"', () => {
  const { cleanedText, hits } = applyGlossary('La redacción logística mostró un buen ajuste.', glossary);
  assert.equal(cleanedText, 'La regresión logística mostró un buen ajuste.');
  assert.deepEqual(hits, [{ wrong: 'redacción logística', correct: 'regresión logística' }]);
});

test('glosario: "pláis cúbicos" -> "splines cúbicos"', () => {
  const { cleanedText, hits } = applyGlossary('Se usaron pláis cúbicos para el modelo.', glossary);
  assert.equal(cleanedText, 'Se usaron splines cúbicos para el modelo.');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].correct, 'splines cúbicos');
});

test('glosario: "índice de Yodin" -> "índice de Youden"', () => {
  const { cleanedText, hits } = applyGlossary('El índice de Yodin fue calculado.', glossary);
  assert.equal(cleanedText, 'El índice de Youden fue calculado.');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].correct, 'índice de Youden');
});

test('glosario: "comodidades" -> "comorbilidades"', () => {
  const { cleanedText, hits } = applyGlossary('El paciente presenta varias comodidades.', glossary);
  assert.equal(cleanedText, 'El paciente presenta varias comorbilidades.');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].correct, 'comorbilidades');
});

test('levenshteinDistance calcula distancias básicas correctamente', () => {
  assert.equal(levenshteinDistance('gato', 'gato'), 0);
  assert.equal(levenshteinDistance('gato', 'pato'), 1);
  assert.equal(levenshteinDistance('', 'abc'), 3);
});

// --- ner-engine.js: al menos 2 ejemplos de PII (nombre, fecha, hospital) ------

test('ner: enmascara nombre, hospital y fecha con placeholders estándar', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];

  const text = 'El paciente juan perez fue atendido en el hospital central el 12/05/2023.';
  const { cleanedText, hits } = applyNerMasking(text, nerPatterns);

  assert.equal(cleanedText, 'El paciente [NOMBRE] fue atendido en el [HOSPITAL] el [FECHA].');
  const labels = hits.map((h) => h.label).sort();
  assert.deepEqual(labels, ['[FECHA]', '[HOSPITAL]', '[NOMBRE]']);
});

test('ner: el valor real detectado se conserva solo en hits[].originalValue, no se pierde', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];

  const { hits } = applyNerMasking('El paciente juan perez llegó tarde.', nerPatterns);
  const nameHit = hits.find((h) => h.label === '[NOMBRE]');
  assert.equal(nameHit.originalValue.toLowerCase(), 'juan perez');
});

// --- clean-pipeline.js: orquestación completa + reglas duras -----------------

test('pipeline completo: originalText es idéntico byte a byte al text de entrada', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = [entrada.covariates.site];

  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns);

  cleanJson.segments.forEach((seg, i) => {
    assert.equal(seg.originalText, entrada.segments[i].text);
  });
});

test('pipeline completo: regla crítica de privacidad — modificationsLog type:"ner" nunca contiene el valor real', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = [entrada.covariates.site];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns);

  const nerLogEntries = cleanJson.segments.flatMap((s) => s.modificationsLog).filter((m) => m.type === 'ner');
  assert.ok(nerLogEntries.length > 0, 'Debe haber al menos una entrada type:"ner" en el fixture (seg-002).');

  for (const entry of nerLogEntries) {
    assert.equal(entry.before, '<redactado>');
    assert.match(entry.after, /^\[[A-ZÁÉÍÓÚÑ]+\]$/);
    // Ninguna entrada debe contener texto real como "juan", "perez", "hospital", "12/05/2023".
    const serialized = JSON.stringify(entry).toLowerCase();
    assert.equal(serialized.includes('juan'), false);
    assert.equal(serialized.includes('perez'), false);
    assert.equal(serialized.includes('12/05/2023'), false);
  }

  // El valor real sí debe existir, pero únicamente en el buffer separado.
  const bufferValues = piiBuffer.entries.map((e) => e.originalValue.toLowerCase());
  assert.ok(bufferValues.some((v) => v.includes('juan')));
});

test('pipeline completo: pii-buffer.local.json nunca es parte de cleanJson (aislamiento de objetos)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns);

  assert.equal('entries' in cleanJson, false);
  assert.equal('piiBuffer' in cleanJson, false);
  assert.equal(cleanJson.stage, 'clean-text');
  assert.equal(piiBuffer.stage, 'pii-buffer');
});

// Nota (docs/DECISIONS.md §2.2 (3)): originalText es una copia inmutable de la
// entrada cruda y por diseño SÍ contiene PII real (contradicción real detectada entre
// API-CONTRACTS.md §4 y ACCEPTANCE-CRITERIA.md §6, resuelta a favor de la inmutabilidad
// de originalText). Por eso este test NUNCA revisa originalText: solo cleanedText y
// modificationsLog, que son los campos que sí deben quedar libres de PII real.
test('pipeline completo: cleanedText y entradas type:"ner" quedan libres de PII real (originalText y type:"punctuation" quedan excluidos a propósito, ver SCOPE.md §2.2 (3))', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = [entrada.covariates.site];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns);

  for (const seg of cleanJson.segments) {
    const cleanedTextLower = seg.cleanedText.toLowerCase();
    const nerLogEntries = seg.modificationsLog.filter((m) => m.type === 'ner');
    const nerLogSerializedLower = JSON.stringify(nerLogEntries).toLowerCase();
    for (const entry of piiBuffer.entries) {
      const realValue = entry.originalValue.toLowerCase();
      assert.equal(cleanedTextLower.includes(realValue), false, `cleanedText de ${seg.segmentId} no debe contener "${realValue}"`);
      assert.equal(nerLogSerializedLower.includes(realValue), false, `modificationsLog type:"ner" de ${seg.segmentId} no debe contener "${realValue}"`);
    }
  }

  // Confirmación explícita de la decisión documentada (SCOPE.md §2.2 (3)):
  // originalText y la entrada type:"punctuation" SÍ conservan la PII real
  // (comportamiento esperado, no una falla de privacidad).
  const seg002 = cleanJson.segments.find((s) => s.segmentId === 'seg-002');
  assert.match(seg002.originalText, /juan perez/i);
  const punctuationEntry = seg002.modificationsLog.find((m) => m.type === 'punctuation');
  assert.match(punctuationEntry.before, /juan perez/i);
});

test('pipeline completo: confidence se copia tal cual, sin recalcularse (incluye null explícito)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns);

  cleanJson.segments.forEach((seg, i) => {
    assert.equal(seg.confidence, entrada.segments[i].confidence);
  });
  // seg-003 en el fixture trae confidence: null explícito.
  const seg003 = cleanJson.segments.find((s) => s.segmentId === 'seg-003');
  assert.equal(seg003.confidence, null);
});

test('pipeline completo: source_hash se calcula y es una cadena hexadecimal de 64 caracteres', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns);

  assert.equal(typeof cleanJson.source_hash, 'string');
  assert.match(cleanJson.source_hash, /^[0-9a-f]{64}$/);
});

test('pipeline completo: aiSuggested=true y editedByHuman=false en todos los segmentos (antes de revisión humana)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns);

  cleanJson.segments.forEach((seg) => {
    assert.equal(seg.aiSuggested, true);
    assert.equal(seg.editedByHuman, false);
  });
  assert.equal(cleanJson.auditLog.finalizedByHuman, false);
});

// --- hash.js -----------------------------------------------------------------

test('sha256Hex produce un hash determinista de 64 caracteres hexadecimales', async () => {
  const hash1 = await sha256Hex('hola mundo');
  const hash2 = await sha256Hex('hola mundo');
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});
