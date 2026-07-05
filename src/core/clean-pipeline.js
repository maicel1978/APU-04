/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Orquesta el pipeline de limpieza de UN caso/entrevista (el batch, ver
 * batch-controller.js, invoca esta función una vez por archivo): valida la
 * entrada, aplica puntuación (Módulo A), glosario de dominio (Módulo B),
 * enmascarado de PII relacional opcional (Módulo C, ver
 * pii-relational-engine.js) y telemetría (Módulo D), y arma cleaned.json +
 * pii-buffer (docs/CONTRACTS.md §4-6). `speakers[]`, `covariateProject` y
 * `covariateSchema` viajan intactos (passthrough, Regla 1 del encargo).
 */

import { validateCleanInput } from './schema-validator.js';
import { applyPunctuationRules } from './text-diff.js';
import { applyGlossary } from './glossary-engine.js';
import { createPiiRelationalMasker } from './pii-relational-engine.js';
import { computeTelemetry, enrichLastSegmentReason } from './telemetry.js';
import { sha256Hex } from '../utils/hash.js';

/**
 * Ejecuta el pipeline lineal de limpieza sobre un único caso ya adaptado al
 * contrato canónico (ver ingest-adapter.js).
 *
 * @param {object} canonicalInput - contrato de entrada canónico (docs/CONTRACTS.md §3).
 * @param {{ wrong: string, correct: string }[]} glossaryEntries - contenido de glossary.json (`entries`).
 * @param {object} nerPatterns - contenido de ner-patterns.json con `listMatchers[].values`
 *   ya completados en runtime (ver ner-patterns-loader.js). Ignorado si `nerOptInActive` es false.
 * @param {boolean} [nerOptInActive=false] - Regla 3 del encargo: el enmascarado de PII
 *   está apagado por defecto; solo se ejecuta si el investigador lo activa explícitamente.
 * @returns {Promise<{ cleanJson: object, piiBuffer: object|null }>}
 *   `piiBuffer` es `null` cuando `nerOptInActive` es false (no se genera el archivo).
 */
export async function runCleanPipeline(canonicalInput, glossaryEntries, nerPatterns, nerOptInActive = false) {
  const validation = validateCleanInput(canonicalInput);
  if (!validation.valid) {
    throw new Error(`La entrada no es válida: ${validation.errors.join('; ')}`);
  }

  const sourceHash = await sha256Hex(JSON.stringify(canonicalInput));
  const masker = nerOptInActive ? createPiiRelationalMasker() : null;

  let previousSegmentEnd = null;
  let termsCorrectedCount = 0;
  const lastIndex = canonicalInput.segments.length - 1;

  const segments = canonicalInput.segments.map((inputSegment, index) => {
    const processed = processSegment(
      inputSegment,
      glossaryEntries,
      nerPatterns,
      previousSegmentEnd,
      masker,
      index === lastIndex,
    );
    previousSegmentEnd = inputSegment.end;
    termsCorrectedCount += processed.glossaryHitsCount;
    return processed.segment;
  });

  const cleanJson = {
    schemaVersion: '5.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'cleaned-text',
    sourceSession: canonicalInput.sourceSession,
    speakers: canonicalInput.speakers, // passthrough intocable (Regla 1)
    covariateProject: canonicalInput.covariateProject, // passthrough intocable
    covariateSchema: canonicalInput.covariateSchema, // passthrough intocable
    source_hash: sourceHash,
    sourceRefs: canonicalInput.sourceRefs,
    auditLog: {
      version: '0.4',
      lastModified: new Date().toISOString(),
      termsCorrectedCount,
      finalizedByHuman: false,
      nerOptInActive,
    },
    segments,
  };

  const piiBuffer = nerOptInActive
    ? {
        schemaVersion: '5.0.0',
        ecosystem: 'APU',
        unit: 'APU-04',
        stage: 'pii-buffer',
        warning: 'Contiene datos identificables. No compartir ni subir a red. No incluir en exportaciones.',
        entityMap: masker.getEntityMap(),
      }
    : null;

  return { cleanJson, piiBuffer };
}

/**
 * Procesa un único segmento a través de los Módulos A, B, (C opcional) y D,
 * construyendo su `modificationsLog` con la regla crítica de privacidad: las
 * entradas `type:"ner"` nunca contienen el valor real en before/after.
 */
function processSegment(inputSegment, glossaryEntries, nerPatterns, previousSegmentEnd, masker, isLastSegment) {
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

  // Módulo C — enmascaramiento de PII relacional, solo si está activo (Regla 3: opt-in).
  let finalText = glossaryResult.cleanedText;
  if (masker) {
    const nerResult = masker.maskSegment(inputSegment.segmentId, finalText, nerPatterns);
    finalText = nerResult.cleanedText;
    for (const hit of nerResult.hits) {
      // Regla crítica (docs/CONTRACTS.md §4): solo placeholders en modificationsLog,
      // el valor real vive exclusivamente en el entityMap del buffer de PII.
      modificationsLog.push(buildLogEntry('ner', '<redactado>', hit.placeholder));
    }
  }

  // Módulo D — telemetría.
  const telemetry = computeTelemetry(
    { cleanedText: finalText, start: inputSegment.start, end: inputSegment.end },
    previousSegmentEnd,
  );
  const anomalyReason = enrichLastSegmentReason(telemetry.reason, telemetry.duration, isLastSegment);

  const segment = {
    segmentId: inputSegment.segmentId,
    speakerId: inputSegment.speakerId,
    speaker: inputSegment.speaker ?? null,
    start: inputSegment.start,
    end: inputSegment.end,
    originalText,
    cleanedText: finalText,
    confidence: inputSegment.confidence ?? null,
    wpm: telemetry.wpm,
    anomalous: telemetry.anomalous,
    anomalyReason, // motivo legible, null si no es anómalo (docs/CONTRACTS.md §4)
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
