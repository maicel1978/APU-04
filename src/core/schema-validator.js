/**
 * Valida un objeto de entrada contra el contrato canónico de APU-04
 * (docs/CONTRACTS.md §3).
 */

// Claves obligatorias de covariates (docs/CONTRACTS.md §3).
// Deben existir SIEMPRE, con valor null explícito si el usuario no las completó
// (regla: "nunca se omite la clave").
const COVARIATE_KEYS = ['caseId', 'group', 'moment', 'sex', 'age', 'site', 'diagnosis'];

// Claves obligatorias de sourceRefs según docs/CONTRACTS.md §3.
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
 * un resultado estructurado (mensajes claros
 * y no técnicos para el usuario final).
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

  validateStudyId(input, errors);
  validateCovariates(input, errors);
  validateSourceRefs(input, errors);
  validateSegments(input, errors);

  return { valid: errors.length === 0, errors };
}

function validateStudyId(input, errors) {
  if (typeof input.studyId !== 'string' || input.studyId.trim() === '') {
    errors.push('Falta "studyId" o no es un texto válido.');
  }
}

function validateCovariates(input, errors) {
  if (input.covariates === null || typeof input.covariates !== 'object' || Array.isArray(input.covariates)) {
    errors.push('Falta el objeto "covariates" o no tiene el formato correcto.');
    return;
  }
  for (const key of COVARIATE_KEYS) {
    if (!(key in input.covariates)) {
      // Regla dura: nunca se omite la clave, debe existir aunque sea null.
      errors.push(`Falta la clave obligatoria "covariates.${key}" (debe existir, usar null si no aplica).`);
    }
  }
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

    if (
      typeof segment.start === 'number' &&
      typeof segment.end === 'number' &&
      segment.end <= segment.start
    ) {
      errors.push(`${where}: "end" (${segment.end}) debe ser mayor que "start" (${segment.start}).`);
    }

    if (typeof segment.speakerId !== 'string' || segment.speakerId.trim() === '') {
      errors.push(`${where}: falta "speakerId" o no es un texto válido.`);
    }

    if (segment.confidence !== null && typeof segment.confidence !== 'number') {
      errors.push(`${where}: "confidence" debe ser un número o null explícito.`);
    }
  });
}
