/**
 * Orquesta el pipeline de limpieza de un caso: valida la entrada, aplica
 * puntuación (Módulo A), glosario de dominio (Módulo B), enmascarado de PII
 * (Módulo C) y telemetría (Módulo D), y arma clean.json + pii-buffer.
 * Ver docs/CONTRACTS.md §4-5 (formato de salida) y docs/DECISIONS.md
 * (por qué originalText es inmutable y por qué modificationsLog type:"ner"
 * nunca lleva el valor real de la PII). Procesa un caso a la vez (sin lotes).
 */

import { validateCleanInput } from './schema-validator.js';
import { applyPunctuationRules } from './text-diff.js';
import { applyGlossary } from './glossary-engine.js';
import { applyNerMasking } from './ner-engine.js';
import { computeTelemetry } from './telemetry.js';
import { sha256Hex } from '../utils/hash.js';

/**
 * Ejecuta el pipeline lineal de limpieza sobre un único
 * caso/entrevista ya adaptado al contrato canónico (ver ingest-adapter.js).
 * No implementa cola de lotes (Capa B) ni índice multi-caso (Capa C): procesa
 * exactamente un `canonicalInput` de principio a fin.
 *
 * @param {object} canonicalInput - contrato de entrada canónico (API-CONTRACTS.md §3).
 * @param {{ wrong: string, correct: string }[]} glossaryEntries - contenido de glossary.json (`entries`).
 * @param {object} nerPatterns - contenido completo de ner-patterns.json, con
 *   `listMatchers[].values` ya completados en runtime (ver ner-engine.js).
 * @returns {Promise<{ cleanJson: object, piiBuffer: object }>}
 */
export async function runCleanPipeline(canonicalInput, glossaryEntries, nerPatterns) {
  const validation = validateCleanInput(canonicalInput);
  if (!validation.valid) {
    throw new Error(`La entrada no es válida: ${validation.errors.join('; ')}`);
  }

  const sourceHash = await sha256Hex(JSON.stringify(canonicalInput));

  const piiEntries = [];
  let previousSegmentEnd = null;
  let termsCorrectedCount = 0;

  const segments = canonicalInput.segments.map((inputSegment) => {
    const processed = processSegment(inputSegment, glossaryEntries, nerPatterns, previousSegmentEnd, piiEntries);
    previousSegmentEnd = inputSegment.end;
    termsCorrectedCount += processed.glossaryHitsCount;
    return processed.segment;
  });

  const cleanJson = {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'clean-text',
    studyId: canonicalInput.studyId,
    covariates: canonicalInput.covariates,
    source_hash: sourceHash,
    sourceRefs: canonicalInput.sourceRefs,
    auditLog: {
      version: '0.3',
      lastModified: new Date().toISOString(),
      termsCorrectedCount,
      finalizedByHuman: false,
    },
    segments,
  };

  const piiBuffer = {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'pii-buffer',
    warning: 'Contiene datos identificables. No compartir ni subir a red. No incluir en exportaciones.',
    entries: piiEntries,
  };

  return { cleanJson, piiBuffer };
}

/**
 * Procesa un único segmento a través de los Módulos A, B, C y D en orden,
 * construyendo su `modificationsLog` con la regla crítica de privacidad:
 * las entradas `type:"ner"` nunca contienen el valor real en before/after.
 */
function processSegment(inputSegment, glossaryEntries, nerPatterns, previousSegmentEnd, piiEntries) {
  const modificationsLog = [];
  const originalText = inputSegment.text; // INMUTABLE: se asigna una sola vez, nunca se reescribe.

  // Módulo A — puntuación/normalización.
  const punctuationResult = applyPunctuationRules(originalText);
  if (punctuationResult.changed) {
    modificationsLog.push(buildLogEntry('punctuation', originalText, punctuationResult.cleanedText));
  }

  // Módulo B — glosario de dominio.
  const glossaryResult = applyGlossary(punctuationResult.cleanedText, glossaryEntries);
  for (const hit of glossaryResult.hits) {
    modificationsLog.push(buildLogEntry('glossary', hit.wrong, hit.correct));
  }

  // Módulo C — enmascaramiento de PII.
  const nerResult = applyNerMasking(glossaryResult.cleanedText, nerPatterns);
  for (const hit of nerResult.hits) {
    // Regla crítica (API-CONTRACTS.md §4): solo placeholders en modificationsLog,
    // el valor real (hit.originalValue) va exclusivamente al buffer de PII.
    modificationsLog.push(buildLogEntry('ner', '<redactado>', hit.placeholder));
    piiEntries.push({
      segmentId: inputSegment.segmentId,
      placeholder: hit.placeholder,
      originalValue: hit.originalValue,
    });
  }

  // Módulo D — telemetría.
  const telemetry = computeTelemetry(
    { cleanedText: nerResult.cleanedText, start: inputSegment.start, end: inputSegment.end },
    previousSegmentEnd,
  );

  const segment = {
    segmentId: inputSegment.segmentId,
    originalText,
    cleanedText: nerResult.cleanedText,
    confidence: inputSegment.confidence ?? null,
    wpm: telemetry.wpm,
    anomalous: telemetry.anomalous,
    aiSuggested: true,
    editedByHuman: false,
    modificationsLog,
  };

  return { segment, glossaryHitsCount: glossaryResult.hits.length };
}

function buildLogEntry(type, before, after) {
  return {
    timestamp: new Date().toISOString(),
    type,
    before,
    after,
  };
}
