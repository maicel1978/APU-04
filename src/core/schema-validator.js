/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Valida un objeto de entrada contra el contrato canónico de APU-04
 * (docs/CONTRACTS.md §3). Reescrito para el contrato v2: sin claves de
 * covariates fijas (Regla 1 del encargo — agnosticismo de covariables).
 */

// Claves obligatorias de sourceRefs (sin cambios respecto a v1).
const SOURCE_REF_KEYS = [
  'sourceAudioFileName',
  'sourceManifestRef',
  'sourceManifestHash',
  'sourceTranscriptRef',
  'sourceTranscriptHash',
];

/**
 * Valida un objeto de entrada contra el contrato canónico de APU-04.
 * Función pura, sin estado, sin E/S. No lanza excepciones: siempre devuelve
 * un resultado estructurado (mensajes claros y no técnicos para el usuario).
 *
 * Deliberadamente NO valida el contenido de `speakers[].covariates`,
 * `covariateProject` ni `covariateSchema`: son passthrough agnóstico, su
 * forma la define VarOps, no APU-04 (docs/CONTRACTS.md §3).
 *
 * @param {*} input - objeto candidato a validar (post-adaptador, ver
 *   src/core/ingest-adapter.js; este módulo NUNCA acepta `id`, solo `segmentId`).
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCleanInput(input) {
  const errors = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['La entrada no es un objeto JSON válido.'] };
  }

  validateSpeakers(input, errors);
  validateSourceRefs(input, errors);
  validateSegments(input, errors);

  return { valid: errors.length === 0, errors };
}

function validateSpeakers(input, errors) {
  if (!Array.isArray(input.speakers)) {
    errors.push('Falta "speakers[]" o no es una lista válida.');
    return;
  }
  const seenIds = new Set();
  input.speakers.forEach((speaker, index) => {
    const where = `speakers[${index}]`;
    if (speaker === null || typeof speaker !== 'object') {
      errors.push(`${where}: el hablante no es un objeto válido.`);
      return;
    }
    if (typeof speaker.id !== 'string' || speaker.id.trim() === '') {
      errors.push(`${where}: falta "id" o no es un texto válido.`);
    } else if (seenIds.has(speaker.id)) {
      errors.push(`${where}: "id" de hablante duplicado ("${speaker.id}").`);
    } else {
      seenIds.add(speaker.id);
    }
    // covariates es agnóstico: solo se exige que, si existe, sea un objeto.
    if (speaker.covariates !== undefined && (speaker.covariates === null || typeof speaker.covariates !== 'object')) {
      errors.push(`${where}: "covariates" debe ser un objeto si está presente.`);
    }
  });
}

function validateSourceRefs(input, errors) {
  if (input.sourceRefs === null || typeof input.sourceRefs !== 'object' || Array.isArray(input.sourceRefs)) {
    errors.push('Falta el objeto "sourceRefs" o no tiene el formato correcto.');
    return;
  }
  for (const key of SOURCE_REF_KEYS) {
    if (!(key in input.sourceRefs)) {
      errors.push(`Falta la clave obligatoria "sourceRefs.${key}" (debe existir, usar null si no está disponible).`);
    }
  }
}

function validateSegments(input, errors) {
  if (!Array.isArray(input.segments) || input.segments.length === 0) {
    errors.push('Falta "segments[]" o está vacío. Se requiere al menos un segmento.');
    return;
  }

  const seenIds = new Set();
  const knownSpeakerIds = new Set(
    Array.isArray(input.speakers) ? input.speakers.map((s) => s && s.id).filter(Boolean) : [],
  );

  input.segments.forEach((segment, index) => {
    const where = `segments[${index}]`;

    if (segment === null || typeof segment !== 'object') {
      errors.push(`${where}: el segmento no es un objeto válido.`);
      return;
    }

    // Regla dura: este es el contrato canónico, exige segmentId, nunca "id".
    if (typeof segment.segmentId !== 'string' || segment.segmentId.trim() === '') {
      errors.push(`${where}: falta "segmentId" o no es un texto válido (no se acepta "id" aquí; use ingest-adapter.js).`);
    } else if (seenIds.has(segment.segmentId)) {
      errors.push(`${where}: "segmentId" duplicado ("${segment.segmentId}"). Debe ser único en el archivo.`);
    } else {
      seenIds.add(segment.segmentId);
    }

    if (typeof segment.text !== 'string') {
      errors.push(`${where}: falta "text" o no es un texto válido.`);
    }

    if (typeof segment.start !== 'number' || Number.isNaN(segment.start)) {
      errors.push(`${where}: falta "start" o no es un número válido.`);
    }

    if (typeof segment.end !== 'number' || Number.isNaN(segment.end)) {
      errors.push(`${where}: falta "end" o no es un número válido.`);
    }

    if (typeof segment.start === 'number' && typeof segment.end === 'number' && segment.end < segment.start) {
      // Regla dura real: "end" no puede ser MENOR que "start" (datos
      // incoherentes, imposibles de interpretar). "end === start" (duración
      // cero) NO se rechaza aquí: es ruido normal de ASR/diarización (ver
      // docs/DECISIONS.md, bugfix 2026-07) y telemetry.js ya lo maneja de
      // forma defensiva marcando el segmento como anómalo, sin bloquear el
      // resto del archivo.
      errors.push(`${where}: "end" (${segment.end}) no puede ser menor que "start" (${segment.start}).`);
    }

    if (typeof segment.speakerId !== 'string' || segment.speakerId.trim() === '') {
      errors.push(`${where}: falta "speakerId" o no es un texto válido.`);
    } else if (knownSpeakerIds.size > 0 && !knownSpeakerIds.has(segment.speakerId)) {
      errors.push(`${where}: "speakerId" ("${segment.speakerId}") no corresponde a ningún hablante declarado en "speakers[]".`);
    }

    if (segment.confidence !== null && segment.confidence !== undefined && typeof segment.confidence !== 'number') {
      errors.push(`${where}: "confidence" debe ser un número o null explícito.`);
    }
  });
}
