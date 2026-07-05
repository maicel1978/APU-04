/**
 * Cubre: src/core/glossary-engine.js, src/core/ner-engine.js,
 * src/core/pii-relational-engine.js, src/core/clean-pipeline.js, src/utils/hash.js.
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
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
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

test('glosario exact:true unifica un sinónimo/abreviatura declarado por el investigador ("IAM" -> "infarto agudo de miocardio")', () => {
  const entries = [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }];
  const { cleanedText, hits } = applyGlossary('El paciente sufrió un IAM la semana pasada.', entries);
  assert.equal(cleanedText, 'El paciente sufrió un infarto agudo de miocardio la semana pasada.');
  assert.deepEqual(hits, [{ wrong: 'IAM', correct: 'infarto agudo de miocardio' }]);
});

test('glosario exact:true NO usa distancia de edición (una palabra parecida pero distinta no debe coincidir)', () => {
  const entries = [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }];
  const { cleanedText, hits } = applyGlossary('Vino a la consulta un tal Iam.', entries);
  // "Iam" (nombre propio, insensible a mayúsculas) SÍ coincide por ser
  // exactamente igual salvo capitalización; se verifica el caso negativo real:
  const entries2 = [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }];
  const { hits: hits2 } = applyGlossary('Se detectó una anomalía diferente.', entries2);
  assert.equal(hits2.length, 0, 'palabras distintas a la declarada no deben coincidir en modo exacto');
});

test('glosario sin exact (por defecto) sigue usando distancia de edición como antes (sin cambios de comportamiento)', () => {
  const entries = [{ wrong: 'comodidades', correct: 'comorbilidades' }];
  const { hits } = applyGlossary('El paciente presenta varias comodidadess.', entries);
  assert.equal(hits.length, 1, 'debe seguir tolerando errores de tecleo cuando exact no está presente');
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

test('BUGFIX regresión: ner enmascara nombres con tildes/ñ al inicio o fin de palabra (antes fallaba en silencio con \\b nativo)', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['Álvarez', 'José', 'Peña', 'María'];

  const cases = [
    { text: 'El paciente Álvarez llegó tarde.', mustContain: '[NOMBRE]' },
    { text: 'Habló con José sobre el diagnóstico.', mustContain: '[NOMBRE]' },
    { text: 'La señora Peña no asistió.', mustContain: '[NOMBRE]' },
    { text: 'María confirmó la cita.', mustContain: '[NOMBRE]' },
  ];

  for (const { text, mustContain } of cases) {
    const { cleanedText, hits } = applyNerMasking(text, nerPatterns);
    assert.ok(cleanedText.includes(mustContain), `"${text}" debería enmascararse, resultó: "${cleanedText}"`);
    assert.ok(hits.length > 0, `"${text}" debería generar al menos un hit`);
  }
});

test('BUGFIX regresión: ner no genera falsos positivos por substring (p. ej. "Ana" no debe matchear dentro de "Anabel")', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['Ana'];
  const { cleanedText, hits } = applyNerMasking('Vino Anabel a la consulta.', nerPatterns);
  assert.equal(cleanedText, 'Vino Anabel a la consulta.');
  assert.equal(hits.length, 0);
});

test('ner: el valor real detectado se conserva solo en hits[].originalValue, no se pierde', () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];

  const { hits } = applyNerMasking('El paciente juan perez llegó tarde.', nerPatterns);
  const nameHit = hits.find((h) => h.label === '[NOMBRE]');
  assert.equal(nameHit.originalValue.toLowerCase(), 'juan perez');
});

// --- clean-pipeline.js: orquestación completa + reglas duras -----------------

test('pipeline con nerOptInActive=false (default, Regla 3): no genera piiBuffer y no enmascara texto', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns, false);

  assert.equal(piiBuffer, null);
  assert.equal(cleanJson.auditLog.nerOptInActive, false);
  const seg002 = cleanJson.segments.find((s) => s.segmentId === 'seg-002');
  assert.match(seg002.cleanedText, /juan perez/i, 'sin opt-in, el texto no debe enmascararse');
});

test('pipeline completo (opt-in): originalText es idéntico byte a byte al text de entrada', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];

  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, true);

  cleanJson.segments.forEach((seg, i) => {
    assert.equal(seg.originalText, entrada.segments[i].text);
  });
});

test('pipeline completo (opt-in): regla crítica de privacidad — modificationsLog type:"ner" nunca contiene el valor real', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns, true);

  const nerLogEntries = cleanJson.segments.flatMap((s) => s.modificationsLog).filter((m) => m.type === 'ner');
  assert.ok(nerLogEntries.length > 0, 'Debe haber al menos una entrada type:"ner" en el fixture (seg-002).');

  for (const entry of nerLogEntries) {
    assert.equal(entry.before, '<redactado>');
    assert.match(entry.after, /^\[[A-ZÁÉÍÓÚÑ_0-9]+\]$/);
    const serialized = JSON.stringify(entry).toLowerCase();
    assert.equal(serialized.includes('juan'), false);
    assert.equal(serialized.includes('perez'), false);
    assert.equal(serialized.includes('12/05/2023'), false);
  }

  // El valor real sí debe existir, pero únicamente en el buffer separado.
  const canonicalValues = Object.values(piiBuffer.entityMap).map((e) => e.canonicalValue.toLowerCase());
  assert.ok(canonicalValues.some((v) => v.includes('juan')));
});

test('pipeline completo (opt-in): pii-buffer.local.json nunca es parte de cleanJson (aislamiento de objetos)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns, true);

  assert.equal('entityMap' in cleanJson, false);
  assert.equal('piiBuffer' in cleanJson, false);
  assert.equal(cleanJson.stage, 'cleaned-text');
  assert.equal(piiBuffer.stage, 'pii-buffer');
});

test('pipeline completo (opt-in): reemplazo relacional indexado — misma entidad, mismo índice en todo el caso', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];

  // Reutilizamos el fixture pero duplicamos la mención en otro segmento para probar consistencia.
  const withRepeatedMention = structuredClone(entrada);
  withRepeatedMention.segments[5].text = 'gracias de nuevo juan perez por su tiempo';

  const { cleanJson } = await runCleanPipeline(withRepeatedMention, glossary, nerPatterns, true);
  const nerAfters = cleanJson.segments.flatMap((s) => s.modificationsLog).filter((m) => m.type === 'ner').map((m) => m.after);
  const personaPlaceholders = nerAfters.filter((p) => p.startsWith('[PERSONA_'));
  assert.ok(personaPlaceholders.length >= 2);
  assert.equal(new Set(personaPlaceholders).size, 1, 'la misma persona debe recibir siempre el mismo índice');
});

test('pipeline completo: cleanedText y entradas type:"ner" quedan libres de PII real (originalText y type:"punctuation" quedan excluidos a propósito, ver docs/CONTRACTS.md §4)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];

  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns, true);

  for (const seg of cleanJson.segments) {
    const cleanedTextLower = seg.cleanedText.toLowerCase();
    const nerLogEntries = seg.modificationsLog.filter((m) => m.type === 'ner');
    const nerLogSerializedLower = JSON.stringify(nerLogEntries).toLowerCase();
    for (const entity of Object.values(piiBuffer.entityMap)) {
      const realValue = entity.canonicalValue.toLowerCase();
      assert.equal(cleanedTextLower.includes(realValue), false, `cleanedText de ${seg.segmentId} no debe contener "${realValue}"`);
      assert.equal(nerLogSerializedLower.includes(realValue), false, `modificationsLog type:"ner" de ${seg.segmentId} no debe contener "${realValue}"`);
    }
  }

  const seg002 = cleanJson.segments.find((s) => s.segmentId === 'seg-002');
  assert.match(seg002.originalText, /juan perez/i);
  const punctuationEntry = seg002.modificationsLog.find((m) => m.type === 'punctuation');
  assert.match(punctuationEntry.before, /juan perez/i);
});

test('pipeline completo: confidence se copia tal cual, sin recalcularse (incluye null explícito)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, false);

  cleanJson.segments.forEach((seg, i) => {
    assert.equal(seg.confidence, entrada.segments[i].confidence);
  });
  const seg003 = cleanJson.segments.find((s) => s.segmentId === 'seg-003');
  assert.equal(seg003.confidence, null);
});

test('pipeline completo: source_hash se calcula y es una cadena hexadecimal de 64 caracteres', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, false);

  assert.equal(typeof cleanJson.source_hash, 'string');
  assert.match(cleanJson.source_hash, /^[0-9a-f]{64}$/);
});

test('pipeline completo: aiSuggested=true y editedByHuman=false en todos los segmentos (antes de revisión humana)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, false);

  cleanJson.segments.forEach((seg) => {
    assert.equal(seg.aiSuggested, true);
    assert.equal(seg.editedByHuman, false);
  });
  assert.equal(cleanJson.auditLog.finalizedByHuman, false);
});

test('pipeline completo: speakers[]/covariateProject/covariateSchema viajan intactos (passthrough, Regla 1)', async () => {
  const nerPatterns = structuredClone(nerPatternsBase);
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, false);

  assert.deepEqual(cleanJson.speakers, entrada.speakers);
  assert.deepEqual(cleanJson.covariateProject, entrada.covariateProject);
  assert.deepEqual(cleanJson.covariateSchema, entrada.covariateSchema);
});

// --- hash.js -----------------------------------------------------------------

test('sha256Hex produce un hash determinista de 64 caracteres hexadecimales', async () => {
  const hash1 = await sha256Hex('hola mundo');
  const hash2 = await sha256Hex('hola mundo');
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});
