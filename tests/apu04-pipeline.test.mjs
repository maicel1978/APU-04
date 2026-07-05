/**
 * Cubre: src/core/text-diff.js, src/core/telemetry.js.
 *
 * Nota: hay discrepancias conocidas entre un fixture de referencia antiguo y
 * el contrato actual (ver docs/DECISIONS.md); los tests documentan cada caso
 * explícitamente en vez de forzarlo con reglas ad hoc.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { applyPunctuationRules } from '../src/core/text-diff.js';
import { computeTelemetry } from '../src/core/telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entradaPath = path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json');
const esperadoPath = path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico-esperado-legacy.json');
const entrada = JSON.parse(readFileSync(entradaPath, 'utf-8'));
const esperado = JSON.parse(readFileSync(esperadoPath, 'utf-8'));

function findEntrada(segmentId) {
  return entrada.segments.find((s) => s.segmentId === segmentId);
}
function findEsperado(segmentId) {
  return esperado.segments.find((s) => s.segmentId === segmentId);
}

// --- text-diff.js (Módulo A) ----------------------------------------------

test('capitaliza la primera letra y agrega punto final si faltan (seg-001)', () => {
  const seg = findEntrada('seg-001');
  const { cleanedText, changed } = applyPunctuationRules(seg.text);
  assert.equal(cleanedText, 'La redacción logística mostró un buen ajuste según el modelo.');
  assert.equal(changed, true);
});

test('no modifica el texto si ya cumple las reglas de puntuación (idempotencia)', () => {
  const alreadyClean = 'Texto correcto ya puntuado.';
  const { cleanedText, changed } = applyPunctuationRules(alreadyClean);
  assert.equal(cleanedText, alreadyClean);
  assert.equal(changed, false);
});

test('colapsa espacios múltiples y recorta espacios al inicio/fin', () => {
  const { cleanedText } = applyPunctuationRules('  hola   mundo  ');
  assert.equal(cleanedText, 'Hola mundo.');
});

test('originalText nunca se modifica: applyPunctuationRules devuelve un nuevo string', () => {
  const seg = findEntrada('seg-002');
  const original = seg.text;
  applyPunctuationRules(seg.text);
  assert.equal(seg.text, original, 'El texto de entrada no debe mutarse.');
});

test('discrepancia conocida: seg-003/004/005/006 requieren tildes/comas fuera de alcance del Módulo A (docs/DECISIONS.md §2.2)', () => {
  // Se documenta explícitamente en vez de silenciar: cleanedText real (solo con
  // las reglas en alcance) difiere del fixture en estos casos porque el fixture
  // incluye restitución de tildes y comas contextuales, fuera del alcance
  // acotado del Módulo A según la decisión registrada en SCOPE.md §2.2 (1).
  const seg003 = findEntrada('seg-003');
  const { cleanedText } = applyPunctuationRules(seg003.text);
  const fixtureClean = findEsperado('seg-003').cleanedText;
  assert.notEqual(cleanedText, fixtureClean, 'Discrepancia esperada y documentada (sin tildes en v1).');
  // Pero sí debe cumplir las reglas que están en alcance:
  assert.equal(cleanedText.charAt(0), cleanedText.charAt(0).toLocaleUpperCase('es'));
  assert.equal(cleanedText.endsWith('.'), true);
});

// --- telemetry.js (Módulo D) -----------------------------------------------

test('calcula wpm correctamente con la fórmula literal de API-CONTRACTS.md §9 (seg-001)', () => {
  const segEntrada = findEntrada('seg-001');
  const segEsperado = findEsperado('seg-001');
  const result = computeTelemetry(
    { cleanedText: segEsperado.cleanedText, start: segEntrada.start, end: segEntrada.end },
    null,
  );
  assert.equal(result.duration, 4.0);
  assert.ok(Math.abs(result.wpm - 150.0) < 0.01);
  assert.equal(result.anomalous, false);
});

test('marca anomalous=true cuando wpm > 220 (seg-003, recalculado: 420.0, no 390.0 del fixture)', () => {
  const segEntrada = findEntrada('seg-003');
  const segEsperado = findEsperado('seg-003');
  const result = computeTelemetry(
    { cleanedText: segEsperado.cleanedText, start: segEntrada.start, end: segEntrada.end },
    findEntrada('seg-002').end,
  );
  // Discrepancia conocida y documentada en docs/DECISIONS.md §2.2 (2):
  // el fixture trae 390.0, la fórmula literal del contrato da 420.0.
  assert.ok(Math.abs(result.wpm - 420.0) < 0.01);
  assert.equal(result.anomalous, true);
});

test('marca anomalous=true por pausa larga > 5.0s respecto al segmento anterior (seg-004)', () => {
  const segEntrada = findEntrada('seg-004');
  const segEsperado = findEsperado('seg-004');
  const previousEnd = findEntrada('seg-003').end; // 11.0
  const result = computeTelemetry(
    { cleanedText: segEsperado.cleanedText, start: segEntrada.start, end: segEntrada.end },
    previousEnd,
  );
  assert.equal(segEntrada.start - previousEnd, 6.0); // pausa real del fixture
  assert.equal(result.anomalous, true);
});

test('marca anomalous=true cuando wpm < 40 (seg-005)', () => {
  const segEntrada = findEntrada('seg-005');
  const segEsperado = findEsperado('seg-005');
  const result = computeTelemetry(
    { cleanedText: segEsperado.cleanedText, start: segEntrada.start, end: segEntrada.end },
    findEntrada('seg-004').end,
  );
  assert.ok(Math.abs(result.wpm - 24.0) < 0.01);
  assert.equal(result.anomalous, true);
});

test('recalcula wpm=90.0 para seg-006 con la fórmula literal (fixture trae 30.0, discrepancia documentada)', () => {
  const segEntrada = findEntrada('seg-006');
  const segEsperado = findEsperado('seg-006');
  const result = computeTelemetry(
    { cleanedText: segEsperado.cleanedText, start: segEntrada.start, end: segEntrada.end },
    findEntrada('seg-005').end,
  );
  assert.ok(Math.abs(result.wpm - 90.0) < 0.01);
  assert.equal(result.anomalous, false); // 90 está entre 40 y 220, y sin pausa larga
});

test('duration=0 se maneja sin dividir por cero: anomalous=true con nota', () => {
  const result = computeTelemetry({ cleanedText: 'algo', start: 5.0, end: 5.0 }, null);
  assert.equal(result.duration, 0);
  assert.equal(result.wpm, 0);
  assert.equal(result.anomalous, true);
  assert.ok(result.note && result.note.length > 0);
});

test('sin segmento anterior (primer segmento), no se evalúa pausa larga', () => {
  const result = computeTelemetry({ cleanedText: 'Hola mundo, esta es una prueba normal.', start: 0, end: 3 }, null);
  assert.equal(result.anomalous, false);
});

// --- reason/anomalyReason (mejora 2026-07: motivo legible de anomalía) ------

test('reason describe ritmo alto cuando wpm > 220', () => {
  const result = computeTelemetry({ cleanedText: Array(30).fill('palabra').join(' '), start: 0, end: 2 }, null);
  assert.match(result.reason, /ritmo de habla inusualmente alto/i);
});

test('reason describe ritmo bajo cuando wpm < 40', () => {
  const result = computeTelemetry({ cleanedText: 'una palabra', start: 0, end: 10 }, null);
  assert.match(result.reason, /ritmo de habla inusualmente bajo/i);
});

test('reason describe pausa larga cuando aplica, y puede combinarse con otra causa', () => {
  const result = computeTelemetry({ cleanedText: 'una palabra', start: 20, end: 30 }, 10);
  assert.match(result.reason, /pausa larga/i);
});

test('reason es null cuando el segmento no es anómalo', () => {
  const result = computeTelemetry({ cleanedText: 'Hola mundo, esta es una prueba normal.', start: 0, end: 3 }, null);
  assert.equal(result.anomalous, false);
  assert.equal(result.reason, null);
});

test('enrichLastSegmentReason amplía el motivo solo si duration<=0 Y es el último segmento', async () => {
  const { enrichLastSegmentReason } = await import('../src/core/telemetry.js');
  const base = 'El inicio y el final de este segmento son iguales, así que no se pudo calcular el ritmo de habla.';

  assert.match(enrichLastSegmentReason(base, 0, true), /último segmento/i);
  assert.equal(enrichLastSegmentReason(base, 0, false), base, 'no debe ampliar si no es el último segmento');
  assert.equal(enrichLastSegmentReason('otro motivo', 5, true), 'otro motivo', 'no debe ampliar si duration > 0');
});

test('mejora: el mensaje de duración inválida está en lenguaje simple, sin notación técnica', () => {
  const result = computeTelemetry({ cleanedText: 'algo', start: 5.0, end: 5.0 }, null);
  assert.equal(result.reason.includes('<='), false, 'no debe usar notación matemática como "<="');
  assert.equal(/\bwpm\b/i.test(result.reason), false, 'no debe usar la abreviatura técnica "wpm"');
  assert.match(result.reason, /no se pudo calcular/i);
});
