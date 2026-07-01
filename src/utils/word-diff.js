/**
 * Diff posicional real (subsecuencia común más larga, LCS) entre dos textos,
 * usado por la pantalla de revisión para el resaltado de cambios. A
 * diferencia de `buildChangeHighlight` en src/ui/review-view.js (que compara
 * por conjunto de palabras y puede sugerir visualmente que se perdió texto
 * que en realidad sigue presente — ver docs/DECISIONS.md), este cálculo
 * preserva el orden y marca solo lo que efectivamente cambió.
 */

/**
 * Calcula un diff palabra por palabra entre dos textos, preservando el orden
 * y devolviendo tramos contiguos etiquetados. Usa el algoritmo de subsecuencia
 * común más larga (LCS) sobre tokens de palabra, adecuado para segmentos de
 * transcripción de longitud típica (decenas de palabras).
 *
 * @param {string} before
 * @param {string} after
 * @returns {{ type: 'equal'|'removed'|'added', text: string }[]}
 */
export function computeWordDiff(before, after) {
  const beforeWords = tokenize(before);
  const afterWords = tokenize(after);

  const lcsTable = buildLcsTable(beforeWords, afterWords);
  const ops = backtrack(lcsTable, beforeWords, afterWords);
  return mergeConsecutive(ops);
}

function tokenize(text) {
  return typeof text === 'string' ? text.split(/\s+/).filter(Boolean) : [];
}

function buildLcsTable(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      table[i][j] =
        a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}

function backtrack(table, a, b) {
  const ops = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      ops.push({ type: 'added', text: b[j - 1] });
      j -= 1;
    } else {
      ops.push({ type: 'removed', text: a[i - 1] });
      i -= 1;
    }
  }
  return ops.reverse();
}

function mergeConsecutive(ops) {
  const merged = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += ` ${op.text}`;
    } else {
      merged.push({ type: op.type, text: op.text });
    }
  }
  return merged;
}
