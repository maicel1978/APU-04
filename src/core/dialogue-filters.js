/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Lógica pura de filtrado/orden para la Vista de Diálogo Continuo (Regla 4
 * del encargo): filtrar por estado (Todos/Pendientes/Anómalos/Revisados),
 * por hablante, por covariable (grupo u otra, mejora 2026-07), y búsqueda
 * instantánea de texto. Sin DOM, testeable en aislamiento; el renderizado
 * vive en src/ui/dialogue-view.js.
 */

/**
 * Determina si un segmento fue revisado por un humano: al menos una entrada
 * type:"human" en modificationsLog (mismo criterio que review-view.js).
 * @param {object} segment
 * @returns {boolean}
 */
export function isReviewed(segment) {
  return Array.isArray(segment.modificationsLog) && segment.modificationsLog.some((e) => e.type === 'human');
}

/**
 * Filtra y ordena cronológicamente (por `start`) los segmentos de un
 * documento para la Vista de Diálogo Continuo: a diferencia de la cola de
 * revisión priorizada por riesgo (review-view.js#sortSegmentsForReview), el
 * guion/chat debe leerse en el orden natural de la conversación.
 *
 * @param {object[]} segments - cleanJson.segments (docs/CONTRACTS.md §4).
 * @param {{ status?: 'all'|'pending'|'anomalous'|'reviewed', speakerId?: string,
 *           covariate?: string|null, query?: string }} filters - `covariate`
 *   es una clave compuesta "clave\u0000valor" (ver collectCovariateOptions),
 *   o `null`/ausente para no filtrar por covariable.
 * @param {{ id: string, covariates?: object }[]} [speakers] - necesario solo
 *   si se usa el filtro por covariable.
 * @returns {object[]} nuevo array filtrado y ordenado (no muta la entrada)
 */
export function filterSegments(segments, filters = {}, speakers = []) {
  const { status = 'all', speakerId = 'all', covariate = null, query = '' } = filters;
  const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase('es') : '';
  const speakerById = new Map((Array.isArray(speakers) ? speakers : []).map((s) => [s.id, s]));

  return [...segments]
    .filter((segment) => matchesStatus(segment, status))
    .filter((segment) => speakerId === 'all' || segment.speakerId === speakerId)
    .filter((segment) => matchesCovariate(segment, covariate, speakerById))
    .filter((segment) => normalizedQuery === '' || segment.cleanedText.toLocaleLowerCase('es').includes(normalizedQuery))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

function matchesStatus(segment, status) {
  if (status === 'all') return true;
  if (status === 'reviewed') return isReviewed(segment);
  if (status === 'pending') return !isReviewed(segment);
  if (status === 'anomalous') return Boolean(segment.anomalous);
  return true;
}

function matchesCovariate(segment, covariate, speakerById) {
  if (!covariate) return true;
  const [key, value] = covariate.split('\u0000');
  const speakerCovariates = speakerById.get(segment.speakerId)?.covariates;
  if (!speakerCovariates || typeof speakerCovariates !== 'object') return false;
  return String(speakerCovariates[key] ?? '') === value;
}

/**
 * Deriva la lista de hablantes distintos presentes en los segmentos, con
 * etiqueta legible, para poblar el filtro de hablante en la barra de
 * herramientas (Regla 4). Preserva el orden de primera aparición.
 *
 * @param {object[]} segments
 * @returns {{ speakerId: string, label: string }[]}
 */
export function collectSpeakersInSegments(segments) {
  const seen = new Map();
  for (const segment of segments) {
    if (!seen.has(segment.speakerId)) {
      seen.set(segment.speakerId, segment.speaker ?? segment.speakerId);
    }
  }
  return [...seen.entries()].map(([speakerId, label]) => ({ speakerId, label }));
}
