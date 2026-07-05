/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Frecuencia de palabras/frases del lote actual (mejora 2026-07, alcance
 * acotado a propósito): ayuda de DESCUBRIMIENTO para que el investigador
 * detecte a simple vista variantes de un mismo concepto (p. ej. "IAM" vs
 * "infarto agudo de miocardio") y decida si vale la pena declarar una regla
 * en el glosario (ver glossary-engine.js, entradas `exact: true`).
 *
 * Deliberadamente NO hace lo que le corresponde a APU-05B (minería textual):
 * sin comparación entre grupos/documentos, sin keyness, sin persistir como
 * resultado de investigación. Es solo un recuento simple del texto ya
 * limpiado (`cleanedText`) de un lote, para ayudar a decidir, no para
 * analizar — ver docs/DECISIONS.md.
 */

// Palabras funcionales sin valor de contenido para el descubrimiento de
// términos (artículos, preposiciones, conectores comunes en español).
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'a', 'en', 'y', 'o', 'que', 'se', 'su', 'sus', 'por', 'para', 'con', 'sin',
  'es', 'son', 'fue', 'fueron', 'ser', 'estar', 'está', 'están', 'lo', 'le',
  'les', 'como', 'más', 'pero', 'si', 'no', 'ya', 'muy', 'este', 'esta',
  'eso', 'esa', 'ese', 'yo', 'tú', 'él', 'ella', 'nosotros', 'ustedes',
]);

/**
 * Calcula las palabras y frases de 2 palabras (bigramas) más frecuentes en
 * el `cleanedText` de todos los segmentos de un lote, para ayudar a detectar
 * variantes de un mismo término. Función pura y determinista: solo cuenta y
 * ordena, no infiere significado ni agrupa sinónimos automáticamente.
 *
 * @param {{ cleanedText: string }[]} segments - segmentos de uno o varios
 *   `cleanJson` (docs/CONTRACTS.md §4); se puede llamar con los segmentos de
 *   un solo archivo o de todo el lote concatenado.
 * @param {{ topN?: number, minLength?: number, minCount?: number }} [options]
 * @returns {{ words: { term: string, count: number }[], bigrams: { term: string, count: number }[] }}
 */
export function computeTermFrequency(segments, options = {}) {
  const { topN = 15, minLength = 3, minCount = 2 } = options;
  const list = Array.isArray(segments) ? segments : [];

  const wordCounts = new Map();
  const bigramCounts = new Map();

  for (const segment of list) {
    const text = typeof segment?.cleanedText === 'string' ? segment.cleanedText : '';
    const words = tokenize(text);

    for (const word of words) {
      if (word.length < minLength || STOPWORDS.has(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }

    for (let i = 0; i < words.length - 1; i += 1) {
      const [a, b] = [words[i], words[i + 1]];
      if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
      if (a.length < minLength || b.length < minLength) continue;
      const bigram = `${a} ${b}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
    }
  }

  return {
    words: toSortedList(wordCounts, minCount, topN),
    bigrams: toSortedList(bigramCounts, minCount, topN),
  };
}

function tokenize(text) {
  return text
    .toLocaleLowerCase('es')
    .replace(/[.,;:!?…"'()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function toSortedList(countMap, minCount, topN) {
  return [...countMap.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count }));
}
