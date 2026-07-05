/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Módulo C (nuevo, v2): envuelve ner-engine.js (reglas + listas, nunca NER
 * estadístico, ver docs/DECISIONS.md) añadiendo reemplazo relacional
 * indexado por caso: la misma entidad recibe siempre el mismo índice
 * ([PERSONA_1], [HOSPITAL_1]...) a lo largo de todo el documento
 * (docs/CONTRACTS.md §6.1). Regla crítica de privacidad: el valor real de
 * una entidad solo se expone a través de `getEntityMap()`, para que el
 * orquestador lo escriba en pii-buffer.local.json; nunca debe llegar a
 * modificationsLog ni a ninguna vista derivada exportable.
 */

import { applyNerMasking } from './ner-engine.js';

// Categorías indexadas (misma entidad => mismo índice en todo el caso).
// FECHA se deja fuera deliberadamente (docs/CONTRACTS.md §6.1): es un dato de
// formato, no una entidad reutilizable a lo largo del documento.
const CATEGORY_BY_LABEL = {
  '[NOMBRE]': 'PERSONA',
  '[HOSPITAL]': 'HOSPITAL',
  '[DIRECCIÓN]': 'DIRECCION',
  '[TELÉFONO]': 'TELEFONO',
};

/**
 * Crea un enmascarador con memoria de entidades para un único caso/entrevista
 * (todas las llamadas a `maskSegment` de un mismo caso deben compartir la
 * misma instancia, para que la indexación sea consistente entre segmentos).
 *
 * @returns {{ maskSegment: Function, getEntityMap: Function }}
 */
export function createPiiRelationalMasker() {
  const indexTables = new Map(); // categoría -> Map(valorNormalizado -> índice)
  const entityMap = {}; // placeholder final -> { canonicalValue, occurrences[] }

  function resolveIndex(category, value) {
    if (!indexTables.has(category)) {
      indexTables.set(category, new Map());
    }
    const table = indexTables.get(category);
    const key = normalize(value);
    if (!table.has(key)) {
      table.set(key, table.size + 1);
    }
    return table.get(key);
  }

  /**
   * Enmascara un segmento ya procesado por los Módulos A/B, asignando
   * índices relacionales consistentes con el resto del caso.
   *
   * @param {string} segmentId
   * @param {string} cleanedText - texto ya normalizado y corregido.
   * @param {object} nerPatterns - ver docs/CONTRACTS.md §11 (sin cambios de formato).
   * @returns {{ cleanedText: string, hits: { label: string, placeholder: string }[] }}
   *   `hits` nunca incluye el valor real (ver getEntityMap para eso).
   */
  function maskSegment(segmentId, cleanedText, nerPatterns) {
    if (typeof segmentId !== 'string' || segmentId.trim() === '') {
      throw new Error('No se pudo enmascarar el segmento: falta un identificador válido.');
    }
    const { cleanedText: plainMasked, hits } = applyNerMasking(cleanedText, nerPatterns);

    let result = plainMasked;
    const relationalHits = [];

    for (const hit of hits) {
      const category = CATEGORY_BY_LABEL[hit.label];
      let finalPlaceholder = hit.label;

      if (category) {
        const index = resolveIndex(category, hit.originalValue);
        finalPlaceholder = `[${category}_${index}]`;
        result = replaceFirstOccurrence(result, hit.label, finalPlaceholder);
      }

      relationalHits.push({ label: hit.label, placeholder: finalPlaceholder });

      if (!entityMap[finalPlaceholder]) {
        entityMap[finalPlaceholder] = { canonicalValue: hit.originalValue, occurrences: [] };
      }
      if (!entityMap[finalPlaceholder].occurrences.includes(segmentId)) {
        entityMap[finalPlaceholder].occurrences.push(segmentId);
      }
    }

    return { cleanedText: result, hits: relationalHits };
  }

  /**
   * @returns {object} mapa placeholder -> { canonicalValue, occurrences }
   *   listo para escribirse en pii-buffer.local.json (docs/CONTRACTS.md §6).
   *   Nunca debe pasarse a derived-views.js ni a ninguna exportación pública.
   */
  function getEntityMap() {
    return entityMap;
  }

  return { maskSegment, getEntityMap };
}

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('es') : String(value);
}

/**
 * Reemplaza la primera ocurrencia restante de `search` en `text` por
 * `replacement`. Los hits de ner-engine.js vienen en el mismo orden en que
 * aparecen en el texto, así que reemplazar secuencialmente la primera
 * ocurrencia asigna el índice correcto incluso si una misma etiqueta plana
 * (p. ej. "[NOMBRE]") aparece varias veces para entidades distintas.
 */
function replaceFirstOccurrence(text, search, replacement) {
  const index = text.indexOf(search);
  if (index === -1) return text;
  return text.slice(0, index) + replacement + text.slice(index + search.length);
}
