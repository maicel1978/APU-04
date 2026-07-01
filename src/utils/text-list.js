/**
 * Utilidad compartida de parseo de listas manuales de texto libre
 * (docs/CONTRACTS.md §7): nunca se infieren, el usuario las declara.
 */

/**
 * Convierte texto libre (una entrada por línea y/o separado por comas) en una
 * lista de valores no vacíos, recortados y sin duplicados (comparación
 * insensible a mayúsculas/minúsculas en español). Función pura, sin acceso a
 * DOM: usada tanto por `src/ui/pii-list-form.js` (para leer el textarea de
 * nombres/direcciones) como por `src/core/ner-patterns-loader.js`.
 *
 * @param {string} rawText
 * @returns {string[]}
 */
export function parseFreeTextList(rawText) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    return [];
  }
  const rawItems = rawText.split(/[\n,]+/);
  return dedupeList(rawItems);
}

/**
 * Elimina duplicados y entradas vacías de una lista de strings, preservando
 * el primer valor encontrado (comparación insensible a mayúsculas/minúsculas
 * en español, para evitar registrar "Juan Pérez" y "juan pérez" como dos
 * entradas distintas de una misma lista manual de PII).
 *
 * @param {string[]} list
 * @returns {string[]}
 */
export function dedupeList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    if (trimmed === '') continue;
    const key = trimmed.toLocaleLowerCase('es');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}
