/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Separa el documento de trabajo interno (cleanJson) en los dos archivos
 * que se exportan (docs/CONTRACTS.md §4/§4bis): `[base]_cleaned.json` (solo
 * lo necesario para trabajar limpio, parecido a la entrada de APU-03: sin
 * traza) y `[base]_trazabilidad.json` (evidencia forense completa, enlazada
 * por segmentId). Pedido explícito del usuario (2026-07): la materia prima
 * para análisis no debe traer la traza mezclada.
 */

export const CLEANED_SCHEMA_VERSION = '5.0.0';

/**
 * Construye el archivo principal reducido, sin traza forense.
 * @param {object} cleanJson - documento de trabajo interno (ver clean-pipeline.js).
 * @returns {object}
 */
export function buildCleanedPackage(cleanJson) {
  return {
    schemaVersion: CLEANED_SCHEMA_VERSION,
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'cleaned-text',
    sourceSession: cleanJson.sourceSession,
    speakers: cleanJson.speakers, // passthrough intocable (Regla 1), igual que en la entrada.
    covariateProject: cleanJson.covariateProject,
    covariateSchema: cleanJson.covariateSchema,
    finalizedByHuman: Boolean(cleanJson.auditLog?.finalizedByHuman),
    segments: cleanJson.segments.map((s) => ({
      segmentId: s.segmentId,
      speakerId: s.speakerId,
      speaker: s.speaker,
      start: s.start,
      end: s.end,
      cleanedText: s.cleanedText,
      confidence: s.confidence,
    })),
  };
}

/**
 * Construye el archivo complementario de trazabilidad, enlazado por
 * `segmentId` al archivo principal.
 * @param {object} cleanJson - documento de trabajo interno.
 * @returns {object}
 */
export function buildTraceabilityPackage(cleanJson) {
  return {
    schemaVersion: CLEANED_SCHEMA_VERSION,
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'trazabilidad',
    sourceSession: cleanJson.sourceSession,
    source_hash: cleanJson.source_hash,
    sourceRefs: cleanJson.sourceRefs,
    auditLog: cleanJson.auditLog,
    segments: cleanJson.segments.map((s) => ({
      segmentId: s.segmentId,
      originalText: s.originalText,
      wpm: s.wpm,
      anomalous: s.anomalous,
      anomalyReason: s.anomalyReason,
      aiSuggested: s.aiSuggested,
      editedByHuman: s.editedByHuman,
      modificationsLog: s.modificationsLog,
    })),
  };
}
