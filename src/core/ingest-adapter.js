/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Único punto autorizado del pipeline para leer el campo "id" por segmento
 * (formato real de APU-03, ver docs/CONTRACTS.md §2). Ningún otro módulo de
 * src/core debe aceptar "id"; todos exigen "segmentId" (verificado por
 * auditoría estática, tests/apu04-static-audit.mjs).
 *
 * Reescrito para el contrato v2 (Regla 1 del encargo): elimina el formulario
 * fijo de covariables clínicas. `speakers[]`, `covariateProject` y
 * `covariateSchema` se tratan como passthrough intocable.
 */

/**
 * Adapta `speakers.json` real de APU-03 (docs/CONTRACTS.md §2) al contrato
 * canónico interno de APU-04 (docs/CONTRACTS.md §3): mapea `id -> segmentId`
 * y conserva intactos `speakers[]`, `covariateProject`, `covariateSchema`.
 *
 * Función pura: no valida reglas de negocio (eso lo hace
 * src/core/schema-validator.js, que corre después de este adaptador).
 *
 * @param {object} speakersJson - documento speakers.json de APU-03 v3.0.0:
 *   { speakers: [{id,label,covariates}], segments: [{id,start,end,text,speakerId,speaker,edited}],
 *     covariateProject, covariateSchema }
 * @param {{ sourceSession?: string|null, sourceRefs?: object }} [options] - metadatos que
 *   no vienen en speakers.json; nunca se infieren, son opcionales.
 * @returns {object} objeto en el contrato canónico de entrada (docs/CONTRACTS.md §3)
 */
export function adaptSpeakersOutput(speakersJson, options = {}) {
  if (speakersJson === null || typeof speakersJson !== 'object') {
    throw new Error('No se pudo leer el archivo de hablantes (speakers.json). Verifique que el archivo no esté dañado.');
  }
  if (!Array.isArray(speakersJson.segments)) {
    throw new Error('El archivo de hablantes no contiene una lista de segmentos ("segments[]").');
  }

  // speakers[] agnóstico: si el archivo no lo trae (caso extremo, no debería
  // ocurrir en una exportación real de APU-03), se conserva como lista vacía
  // en vez de bloquear el flujo (Regla 1: cero bloqueo por ausencia de datos).
  const speakers = Array.isArray(speakersJson.speakers) ? speakersJson.speakers.map(mapSpeaker) : [];

  return {
    sourceSession: options.sourceSession ?? null,
    speakers,
    // Passthrough intocable (Regla 1): se copian tal cual, incluyendo null/[].
    covariateProject: speakersJson.covariateProject ?? null,
    covariateSchema: speakersJson.covariateSchema ?? null,
    sourceRefs: normalizeSourceRefs(options.sourceRefs),
    segments: speakersJson.segments.map(mapSegment),
  };
}

/**
 * Copia un hablante tal cual, garantizando que `covariates` exista como
 * objeto (nunca `undefined`) para simplificar el resto del pipeline, sin
 * inventar ni exigir claves específicas dentro de él (agnosticismo real).
 */
function mapSpeaker(speaker) {
  if (speaker === null || typeof speaker !== 'object') {
    throw new Error('Se encontró un hablante con formato inválido en el archivo de hablantes.');
  }
  return {
    id: speaker.id,
    label: speaker.label ?? null,
    covariates: speaker.covariates && typeof speaker.covariates === 'object' ? speaker.covariates : {},
  };
}

/**
 * Mapea un segmento individual de speakers.json (`id`) al esquema canónico
 * (`segmentId`). `start/end/text/speakerId/speaker` se copian sin modificar.
 * `confidence` puede no venir incluida; queda `null` explícito si falta.
 * `edited` (bandera de APU-03) se preserva solo como metadato informativo,
 * no participa en las reglas de revisión propias de APU-04.
 */
function mapSegment(segment) {
  if (segment === null || typeof segment !== 'object') {
    throw new Error('Se encontró un segmento con formato inválido en el archivo de hablantes.');
  }
  return {
    segmentId: segment.id,
    text: segment.text,
    start: segment.start,
    end: segment.end,
    speakerId: segment.speakerId,
    speaker: segment.speaker ?? null,
    confidence: segment.confidence ?? null,
    sourceEdited: segment.edited ?? false,
  };
}

// Claves obligatorias de sourceRefs (sin cambios respecto a v1).
const SOURCE_REF_KEYS = [
  'sourceAudioFileName',
  'sourceManifestRef',
  'sourceManifestHash',
  'sourceTranscriptRef',
  'sourceTranscriptHash',
];

/**
 * Garantiza que todas las claves de sourceRefs existan, con null explícito
 * cuando el archivo fuente no está disponible al momento de la ingestión.
 */
function normalizeSourceRefs(sourceRefs) {
  const source = sourceRefs && typeof sourceRefs === 'object' ? sourceRefs : {};
  const normalized = {};
  for (const key of SOURCE_REF_KEYS) {
    normalized[key] = key in source ? source[key] : null;
  }
  return normalized;
}
