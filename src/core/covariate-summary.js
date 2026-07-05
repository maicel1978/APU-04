/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Visibilidad de covariables (mejora 2026-07, pedida por el usuario): el
 * "grupo" u otra covariable que venga de VarOps ya viaja intacta por el
 * pipeline (passthrough, Regla 1) y ya sale en el CSV (derived-views.js,
 * columnas `cv_*`). Lo que faltaba era VERLA dentro de la propia interfaz
 * mientras se revisa: conteo por valor en el Panel de calidad, y filtro
 * adicional en la Vista de Diálogo. Deliberadamente solo cuenta/agrupa
 * (determinista); NO compara grupos ni calcula significancia — eso es
 * responsabilidad de APU-05C (comparación por covariables), fuera de
 * alcance de APU-04 (ver docs/DECISIONS.md).
 */

/**
 * Cuenta, por cada clave de covariable presente en `speakers[]`, cuántos
 * segmentos pertenecen a cada valor. Segmentos cuyo hablante no tiene esa
 * covariable (o la tiene vacía) no se cuentan en esa clave.
 *
 * @param {{ speakerId: string }[]} segments
 * @param {{ id: string, covariates?: object }[]} speakers
 * @returns {{ [key: string]: { [value: string]: number } }}
 */
export function collectCovariateBreakdown(segments, speakers) {
  const speakerById = new Map((Array.isArray(speakers) ? speakers : []).map((s) => [s.id, s]));
  const breakdown = {};

  for (const segment of Array.isArray(segments) ? segments : []) {
    const speaker = speakerById.get(segment.speakerId);
    const covariates = speaker?.covariates;
    if (!covariates || typeof covariates !== 'object') continue;

    for (const [key, value] of Object.entries(covariates)) {
      if (value === null || value === undefined || value === '') continue;
      const stringValue = String(value);
      breakdown[key] ??= {};
      breakdown[key][stringValue] = (breakdown[key][stringValue] ?? 0) + 1;
    }
  }

  return breakdown;
}

/**
 * Combina varios conteos (uno por archivo del lote) en uno solo, sumando
 * las cifras por clave y valor. Usado por el Panel de calidad para mostrar
 * el total del lote completo.
 *
 * @param {{ [key: string]: { [value: string]: number } }[]} breakdowns
 * @returns {{ [key: string]: { [value: string]: number } }}
 */
export function mergeCovariateBreakdowns(breakdowns) {
  const merged = {};
  for (const breakdown of Array.isArray(breakdowns) ? breakdowns : []) {
    for (const [key, values] of Object.entries(breakdown ?? {})) {
      merged[key] ??= {};
      for (const [value, count] of Object.entries(values)) {
        merged[key][value] = (merged[key][value] ?? 0) + count;
      }
    }
  }
  return merged;
}

/**
 * Deriva la lista de combinaciones clave/valor distintas presentes en
 * `speakers[]`, para poblar el filtro adicional por covariable en la Vista
 * de Diálogo. Preserva el orden de primera aparición.
 *
 * @param {{ covariates?: object }[]} speakers
 * @returns {{ key: string, value: string, label: string }[]}
 */
export function collectCovariateOptions(speakers) {
  const seen = new Set();
  const options = [];
  for (const speaker of Array.isArray(speakers) ? speakers : []) {
    const covariates = speaker?.covariates;
    if (!covariates || typeof covariates !== 'object') continue;
    for (const [key, value] of Object.entries(covariates)) {
      if (value === null || value === undefined || value === '') continue;
      const stringValue = String(value);
      const dedupeKey = `${key}\u0000${stringValue}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      options.push({ key, value: stringValue, label: `${key}: ${stringValue}` });
    }
  }
  return options;
}

/**
 * Devuelve una etiqueta legible con las covariables del hablante de un
 * segmento (p. ej. "grupo_estudio: Intervención"), o null si no tiene
 * ninguna. Usado para mostrarla junto al nombre del hablante en el diálogo.
 *
 * @param {string} speakerId
 * @param {{ id: string, covariates?: object }[]} speakers
 * @returns {string|null}
 */
export function formatSpeakerCovariateLabel(speakerId, speakers) {
  const speaker = (Array.isArray(speakers) ? speakers : []).find((s) => s.id === speakerId);
  const covariates = speaker?.covariates;
  if (!covariates || typeof covariates !== 'object') return null;

  const parts = Object.entries(covariates)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${value}`);

  return parts.length > 0 ? parts.join(' · ') : null;
}
