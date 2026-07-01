/**
 * Módulo C: enmascaramiento de PII por reglas y listas (no NER estadístico),
 * ver docs/DECISIONS.md (por qué se usan reglas y listas, no modelos de PLN
 * estadísticos preentrenados). Regla crítica: el valor
 * real de una entidad detectada NUNCA debe escribirse en modificationsLog
 * (solo placeholders). Este módulo devuelve el valor real en
 * `hits[].originalValue` exclusivamente para que clean-pipeline.js lo enrute
 * al buffer pii-buffer.local.json (docs/CONTRACTS.md §5); nunca copiarlo en
 * modificationsLog.
 */

/**
 * Aplica el motor de reglas + listas de NER (no estadístico) sobre un texto
 * ya procesado por los Módulos A/B, enmascarando coincidencias con los
 * placeholders estándar y devolviendo, por separado, el valor real detectado
 * para que el orquestador lo mueva al buffer de PII (nunca a modificationsLog).
 *
 * Función pura: no lee `assets/data/ner-patterns.json` (E/S es responsabilidad
 * de quien orquesta), recibe los patrones ya cargados.
 *
 * @param {string} cleanedText - texto ya normalizado (Módulo A) y corregido (Módulo B).
 * @param {{ regexPatterns: {label:string,pattern:string}[],
 *           listMatchers: {label:string,source:string,values:string[]}[] }} nerPatterns
 *   Documento completo de `ner-patterns.json`. `listMatchers[].values` puede venir
 *   ya completado en runtime (p. ej. con `covariates.site` y la lista de nombres
 *   del investigador), ver docs/CONTRACTS.md §7.
 * @returns {{ cleanedText: string,
 *             hits: { label: string, placeholder: string, originalValue: string }[] }}
 *   `hits[].originalValue` es el texto real detectado — solo para el buffer de PII,
 *   nunca para modificationsLog.
 */
export function applyNerMasking(cleanedText, nerPatterns) {
  if (typeof cleanedText !== 'string') {
    throw new Error('El texto a enmascarar no es válido.');
  }
  if (nerPatterns === null || typeof nerPatterns !== 'object') {
    throw new Error('Los patrones de NER no tienen un formato válido.');
  }

  let result = cleanedText;
  const hits = [];

  // 1) Patrones regex (formatos estructurados: fechas, teléfonos, etc.)
  const regexPatterns = Array.isArray(nerPatterns.regexPatterns) ? nerPatterns.regexPatterns : [];
  for (const rule of regexPatterns) {
    const regex = new RegExp(rule.pattern, 'g');
    result = result.replace(regex, (match) => {
      hits.push({ label: rule.label, placeholder: rule.label, originalValue: match });
      return rule.label;
    });
  }

  // 2) Listas de coincidencia exacta (nombres, sitios, direcciones provistas
  //    en tiempo de ejecución, ver docs/CONTRACTS.md §7).
  const listMatchers = Array.isArray(nerPatterns.listMatchers) ? nerPatterns.listMatchers : [];
  for (const matcher of listMatchers) {
    const values = Array.isArray(matcher.values) ? matcher.values : [];
    for (const value of values) {
      if (!value) continue;
      result = replaceCaseInsensitive(result, value, matcher.label, hits);
    }
  }

  return { cleanedText: result, hits };
}

/**
 * Reemplaza todas las ocurrencias de `value` en `text` (comparación
 * insensible a mayúsculas/minúsculas, respetando límites de palabra),
 * registrando cada coincidencia en `hits` con el valor real encontrado
 * (preservando su capitalización original en el texto, no la de la lista).
 */
function replaceCaseInsensitive(text, value, label, hits) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  return text.replace(regex, (match) => {
    hits.push({ label, placeholder: label, originalValue: match });
    return label;
  });
}
