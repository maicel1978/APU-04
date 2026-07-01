/**
 * Completa `ner-patterns.json` (plantilla con `listMatchers[].values: []`)
 * con los valores que solo se conocen en runtime: `covariates.site` y las
 * listas manuales que el usuario escribe en la UI. Nunca infiere estos
 * valores del texto — ver docs/CONTRACTS.md §7.
 */

import { dedupeList } from '../utils/text-list.js';

/**
 * Completa (sin mutar) la plantilla de `ner-patterns.json` con los valores que
 * solo se conocen en tiempo de ejecución: el sitio/hospital del caso actual
 * (`covariates.site`) y las listas manuales que el investigador escribe en la
 * UI (nombres del consentimiento informado, direcciones). Nunca infiere estos
 * valores automáticamente del texto: si el investigador no los provee, la
 * lista queda vacía y ese `listMatcher` simplemente no encuentra coincidencias.
 *
 * @param {object} nerPatternsTemplate - contenido de assets/data/ner-patterns.json
 *   (con `listMatchers[].values` típicamente vacíos, `[]`).
 * @param {{ site?: string|null, manualNames?: string[], manualAddresses?: string[] }} runtimeValues
 * @returns {object} nueva copia de nerPatternsTemplate con listMatchers hidratados.
 */
export function hydrateNerPatterns(nerPatternsTemplate, runtimeValues = {}) {
  if (nerPatternsTemplate === null || typeof nerPatternsTemplate !== 'object') {
    throw new Error('La plantilla de patrones de NER no tiene un formato válido.');
  }

  const { site = null, manualNames = [], manualAddresses = [] } = runtimeValues ?? {};
  const listMatchers = Array.isArray(nerPatternsTemplate.listMatchers)
    ? nerPatternsTemplate.listMatchers
    : [];

  const hydrated = listMatchers.map((matcher) => {
    if (matcher.source === 'covariates.site') {
      return { ...matcher, values: site ? [site] : [] };
    }
    if (matcher.source === 'studio-consentimiento') {
      return { ...matcher, values: sanitizeList(manualNames) };
    }
    if (matcher.source === 'manual') {
      return { ...matcher, values: sanitizeList(manualAddresses) };
    }
    // Fuente desconocida: se conserva tal cual, sin inventar comportamiento.
    return { ...matcher };
  });

  return { ...nerPatternsTemplate, listMatchers: hydrated };
}

function sanitizeList(list) {
  return dedupeList(Array.isArray(list) ? list : []);
}
