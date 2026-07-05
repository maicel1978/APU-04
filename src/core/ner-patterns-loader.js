/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Completa `ner-patterns.json` (plantilla con `listMatchers[].values: []`)
 * con las listas manuales que el investigador declara en la UI (nombres,
 * hospitales/sitios, direcciones). Nunca infiere estos valores del texto ni
 * de covariables — v2 elimina la fuente "covariates.site" (Regla 1: ya no
 * existe una clave fija "site" en el contrato de covariables agnóstico).
 */

import { dedupeList } from '../utils/text-list.js';

/**
 * Completa (sin mutar) la plantilla de `ner-patterns.json` con las listas
 * manuales que el investigador escribe en la UI de configuración de
 * privacidad (docs/CONTRACTS.md §11). Si el investigador no provee una
 * lista, ese `listMatcher` simplemente no encuentra coincidencias.
 *
 * @param {object} nerPatternsTemplate - contenido de assets/data/ner-patterns.json.
 * @param {{ manualNames?: string[], manualHospitals?: string[], manualAddresses?: string[] }} runtimeValues
 * @returns {object} nueva copia de nerPatternsTemplate con listMatchers hidratados.
 */
export function hydrateNerPatterns(nerPatternsTemplate, runtimeValues = {}) {
  if (nerPatternsTemplate === null || typeof nerPatternsTemplate !== 'object') {
    throw new Error('La plantilla de patrones de PII no tiene un formato válido.');
  }

  const { manualNames = [], manualHospitals = [], manualAddresses = [] } = runtimeValues ?? {};
  const listMatchers = Array.isArray(nerPatternsTemplate.listMatchers)
    ? nerPatternsTemplate.listMatchers
    : [];

  const hydrated = listMatchers.map((matcher) => {
    if (matcher.source === 'manual-nombres') {
      return { ...matcher, values: sanitizeList(manualNames) };
    }
    if (matcher.source === 'manual-hospitales') {
      return { ...matcher, values: sanitizeList(manualHospitals) };
    }
    if (matcher.source === 'manual-direcciones') {
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
