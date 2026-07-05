/**
 * Módulo B: corrección de términos de dominio bioestadístico/clínico contra
 * assets/data/glossary.json, usando distancia de Levenshtein sobre n-gramas.
 * Ver docs/CONTRACTS.md §7 (formato de glossary.json). Las sustituciones se
 * registran en modificationsLog con type:"glossary" (texto real, no es PII).
 *
 * Extensión (2026-07): entradas con `exact: true` unifican variantes/sinónimos
 * que el investigador declara explícitamente (p. ej. "IAM" -> "infarto agudo
 * de miocardio"), donde la distancia de edición NO aplica (son palabras
 * distintas, no errores de tecleo de la misma palabra). Coincidencia por
 * palabra completa, insensible a mayúsculas, sin heurística de "parecido".
 * Sigue siendo 100% determinista: el investigador declara la regla, la app
 * la aplica siempre igual — coherente con "la IA sugiere, el investigador
 * decide" (nunca se infieren sinónimos automáticamente).
 */

// Umbral de distancia de edición: distancia ≤2 para términos de ≤12 caracteres,
// proporcional para términos más largos (ver docs/CONTRACTS.md §7).
function distanceThreshold(term) {
  const length = term.length;
  return length <= 12 ? 2 : Math.ceil(length / 6);
}

/**
 * Distancia de edición (Levenshtein) entre dos cadenas. Implementación nativa
 * en JS, sin dependencias externas, conforme a docs/DECISIONS.md §2.1
 * ("SymSpell/Levenshtein... Implementación nativa en JS").
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let previousRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1, // inserción
          previousRow[j] + 1, // eliminación
          previousRow[j - 1] + cost, // sustitución
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[n];
}

/**
 * Extrae la puntuación de cierre final de un token (., !, ?, ,, ;, :) para
 * poder compararlo por su núcleo alfabético y reponer la puntuación después.
 */
function splitTrailingPunctuation(token) {
  const match = token.match(/^(.*?)([.,;:!?…]*)$/);
  return { core: match[1], trailing: match[2] };
}

/**
 * Aplica el glosario de términos de dominio bioestadístico/clínico sobre un
 * texto ya procesado por el Módulo A (text-diff.js). Dos modos por entrada:
 *  - Por defecto (sin `exact`): distancia de Levenshtein sobre n-gramas de
 *    palabras consecutivas, con el umbral definido en docs/CONTRACTS.md §7
 *    — pensado para errores de transcripción de la MISMA palabra/frase.
 *  - `exact: true`: coincidencia exacta por palabra completa (insensible a
 *    mayúsculas), sin heurística de distancia — pensado para unificar
 *    variantes/sinónimos que el investigador declara ("IAM" -> "infarto
 *    agudo de miocardio"), donde ambos términos son palabras distintas.
 *
 * Función pura: no lee `assets/data/glossary.json` (esa E/S es responsabilidad
 * de quien orquesta el pipeline, `clean-pipeline.js`), recibe las entradas ya
 * cargadas para mantenerse testeable sin sistema de archivos.
 *
 * @param {string} cleanedText - texto ya normalizado por el Módulo A.
 * @param {{ wrong: string, correct: string, exact?: boolean }[]} glossaryEntries
 * @returns {{ cleanedText: string, hits: { wrong: string, correct: string }[] }}
 */
export function applyGlossary(cleanedText, glossaryEntries) {
  if (typeof cleanedText !== 'string') {
    throw new Error('El texto a corregir con el glosario no es válido.');
  }
  if (!Array.isArray(glossaryEntries)) {
    throw new Error('El glosario no tiene un formato válido (se esperaba una lista de entradas).');
  }

  const tokens = cleanedText.split(/\s+/).filter((t) => t.length > 0);
  const hits = [];

  for (const entry of glossaryEntries) {
    const wrongWords = entry.wrong.trim().split(/\s+/);
    const windowSize = wrongWords.length;
    const isExact = entry.exact === true;
    const threshold = isExact ? 0 : distanceThreshold(entry.wrong);

    for (let start = 0; start <= tokens.length - windowSize; start += 1) {
      const windowTokens = tokens.slice(start, start + windowSize);
      const last = splitTrailingPunctuation(windowTokens[windowSize - 1]);
      const windowCore = [...windowTokens.slice(0, windowSize - 1), last.core]
        .join(' ')
        .toLocaleLowerCase('es');
      const wrongNormalized = entry.wrong.toLocaleLowerCase('es');

      const matches = isExact
        ? windowCore === wrongNormalized
        : levenshteinDistance(windowCore, wrongNormalized) <= threshold;

      if (matches) {
        const isSentenceStart = start === 0;
        const replacement = buildReplacement(entry.correct, last.trailing, isSentenceStart);
        tokens.splice(start, windowSize, ...replacement.split(' '));
        hits.push({ wrong: entry.wrong, correct: entry.correct });
        // No reintentar sobre la región ya reemplazada.
        break;
      }
    }
  }

  return { cleanedText: tokens.join(' '), hits };
}

/**
 * Construye el texto de reemplazo conservando la puntuación de cierre del
 * token final de la ventana original, y capitalizando si el reemplazo cae
 * al inicio absoluto del segmento.
 */
function buildReplacement(correct, trailingPunctuation, isSentenceStart) {
  let replacement = `${correct}${trailingPunctuation}`;
  if (isSentenceStart) {
    replacement = replacement.charAt(0).toLocaleUpperCase('es') + replacement.slice(1);
  }
  return replacement;
}
