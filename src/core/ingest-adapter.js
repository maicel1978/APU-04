/**
 * Único punto autorizado del pipeline para leer el campo "id" (formato de la
 * unidad anterior, speakers.json). Ningún otro módulo de src/core debe
 * aceptar "id"; todos exigen "segmentId" (verificado por auditoría estática).
 */

/**
 * Adapta `speakers.json` (usa `id` por segmento, sin `studyId`/`covariates`)
 * al contrato de entrada canónico de APU-04 (docs/CONTRACTS.md §2-3):
 *  1. Mapea `id -> segmentId`; `start/end/text/speakerId` se copian tal cual.
 *  2. Incorpora `studyId`/`covariates`/`sourceRefs`, que no vienen del
 *     pipeline anterior y se recolectan en la UI (src/ui/covariates-form.js);
 *     este módulo no es UI, solo recibe esos datos ya recolectados como
 *     `formData`.
 *
 * Función pura: no valida reglas de negocio (eso lo hace
 * src/core/schema-validator.js, que corre después de este adaptador).
 *
 * @param {object} speakersJson - documento speakers.json (docs/CONTRACTS.md §2):
 *   { segments: [{ id, speakerId, start, end, text }], ... }
 * @param {object} formData - datos no provistos por el pipeline anterior:
 *   { studyId: string, covariates: object, sourceRefs?: object }
 * @returns {object} objeto en el contrato canónico de entrada (docs/CONTRACTS.md §3)
 */
export function adaptSpeakersOutput(speakersJson, formData) {
  if (speakersJson === null || typeof speakersJson !== 'object') {
    throw new Error('No se pudo leer el archivo de hablantes (speakers.json). Verifique que el archivo no esté dañado.');
  }
  if (!Array.isArray(speakersJson.segments)) {
    throw new Error('El archivo de hablantes no contiene una lista de segmentos ("segments[]").');
  }
  if (formData === null || typeof formData !== 'object') {
    throw new Error('Faltan los datos del formulario de estudio (studyId/covariates).');
  }

  return {
    studyId: formData.studyId ?? null,
    covariates: normalizeCovariates(formData.covariates),
    sourceRefs: normalizeSourceRefs(formData.sourceRefs),
    segments: speakersJson.segments.map(mapSegment),
  };
}

/**
 * Mapea un segmento individual de speakers.json (`id`) al esquema canónico
 * (`segmentId`). `start/end/text/speakerId` se copian sin modificar.
 * `confidence` puede no venir incluida; queda `null` explícito si falta,
 * nunca se omite la clave (docs/CONTRACTS.md §3).
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
    confidence: segment.confidence ?? null,
  };
}

// Claves obligatorias de covariates, ver docs/CONTRACTS.md §3.
const COVARIATE_KEYS = ['caseId', 'group', 'moment', 'sex', 'age', 'site', 'diagnosis'];

/**
 * Garantiza que todas las claves de covariates existan, con null explícito
 * cuando el investigador no las completó (regla dura: nunca se omite la clave).
 */
function normalizeCovariates(covariates) {
  const source = covariates && typeof covariates === 'object' ? covariates : {};
  const normalized = {};
  for (const key of COVARIATE_KEYS) {
    normalized[key] = key in source ? source[key] : null;
  }
  return normalized;
}

// Claves obligatorias de sourceRefs, ver docs/CONTRACTS.md §3.
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
