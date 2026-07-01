/**
 * Módulo A: puntuación/normalización determinista (modificationsLog
 * type:"punctuation"). Deliberadamente NO restituye tildes ni agrega comas
 * contextuales — ver docs/DECISIONS.md.
 */

/**
 * Aplica las reglas deterministas de puntuación/normalización del Módulo A:
 *  - Capitalización de la primera letra del segmento.
 *  - Colapso de espacios múltiples a uno solo (normalización de espaciado).
 *  - Recorte de espacios al inicio/fin.
 *  - Inserción de punto final si el segmento no termina ya en un signo de
 *    puntuación de cierre (. ! ?).
 *
 * Función pura, sin estado. No modifica `originalText`: recibe una copia de
 * texto (`text`) y devuelve un nuevo string (`cleanedText`); la inmutabilidad
 * de `originalText` es responsabilidad de quien orquesta el pipeline
 * (src/core/clean-pipeline.js), que nunca debe reasignar ese campo.
 *
 * @param {string} text - texto de entrada del segmento (ASR crudo).
 * @returns {{ cleanedText: string, changed: boolean }}
 */
export function applyPunctuationRules(text) {
  if (typeof text !== 'string') {
    throw new Error('El texto del segmento no es válido (se esperaba una cadena de texto).');
  }

  let result = collapseWhitespace(text);
  result = capitalizeFirstLetter(result);
  result = ensureTrailingPunctuation(result);

  return {
    cleanedText: result,
    changed: result !== text,
  };
}

/**
 * Colapsa espacios múltiples a uno solo y recorta espacios al inicio/fin.
 */
function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Capitaliza la primera letra del segmento (normalización Unicode-safe
 * mediante localeCompare/toLocaleUpperCase, sin asumir solo ASCII).
 */
function capitalizeFirstLetter(text) {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

// Signos de cierre que ya cuentan como puntuación final válida.
const CLOSING_PUNCTUATION = ['.', '!', '?', '…'];

/**
 * Añade un punto final si el segmento no termina ya en un signo de cierre.
 */
function ensureTrailingPunctuation(text) {
  if (text.length === 0) {
    return text;
  }
  const lastChar = text.charAt(text.length - 1);
  if (CLOSING_PUNCTUATION.includes(lastChar)) {
    return text;
  }
  return `${text}.`;
}
