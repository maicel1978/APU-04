/**
 * Genera las vistas derivadas (TXT, CSV, reportes) siempre a partir de
 * clean.json; nunca se editan ni se mantienen por separado. Ver docs/CONTRACTS.md
 * §6. Todas las funciones reciben solo `cleanJson`, nunca `piiBuffer`: es
 * estructuralmente imposible que filtren el valor real de la PII. Excepción:
 * `buildEditLogCsv` redacta el campo `before`/`after` de la entrada
 * type:"punctuation" cuando el segmento tiene coincidencias NER (a diferencia
 * de clean.json, que sí conserva ese texto crudo — ver docs/DECISIONS.md).
 * `glossary-hits`/`flagged-segments` son por caso, sin agregación de estudio.
 */

/**
 * Genera la vista de texto plano: concatenación de cleanedText de todos los
 * segmentos, en orden, separados por línea en blanco.
 * @param {object} cleanJson
 * @returns {string}
 */
export function buildCleanTxt(cleanJson) {
  return cleanJson.segments.map((s) => s.cleanedText).join('\n\n');
}

const CSV_HEADERS_CLEAN = ['segmentId', 'start', 'end', 'speakerId', 'cleanedText', 'wpm', 'anomalous', 'confidence'];

/**
 * Genera la vista tabular por segmento (CSV).
 * Nota: `start`/`end`/`speakerId` no forman parte del esquema de salida de
 * clean.json (API-CONTRACTS.md §4 no los incluye en `segments[]`); se dejan
 * vacíos si no están disponibles, sin inventar valores.
 * @param {object} cleanJson
 * @returns {string}
 */
export function buildCleanCsv(cleanJson) {
  const rows = cleanJson.segments.map((s) => [
    s.segmentId,
    s.start ?? '',
    s.end ?? '',
    s.speakerId ?? '',
    s.cleanedText,
    s.wpm,
    s.anomalous,
    s.confidence,
  ]);
  return toCsv(CSV_HEADERS_CLEAN, rows);
}

/**
 * Genera el reporte de calidad agregado: total de segmentos, % editado por
 * humano, % anómalo, distribución de wpm, conteo de sustituciones por tipo.
 * @param {object} cleanJson
 * @returns {object}
 */
export function buildQualityReport(cleanJson) {
  const segments = cleanJson.segments;
  const total = segments.length;
  const editedCount = segments.filter((s) => s.editedByHuman).length;
  const anomalousCount = segments.filter((s) => s.anomalous).length;
  const wpmValues = segments.map((s) => s.wpm);

  const substitutionCounts = { punctuation: 0, glossary: 0, ner: 0, human: 0 };
  for (const segment of segments) {
    for (const entry of segment.modificationsLog) {
      if (entry.type in substitutionCounts) {
        substitutionCounts[entry.type] += 1;
      }
    }
  }

  return {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'quality-report',
    totalSegments: total,
    editedByHumanPercentage: percentage(editedCount, total),
    anomalousPercentage: percentage(anomalousCount, total),
    wpmDistribution: {
      min: wpmValues.length ? Math.min(...wpmValues) : 0,
      max: wpmValues.length ? Math.max(...wpmValues) : 0,
      average: wpmValues.length ? average(wpmValues) : 0,
    },
    substitutionCounts,
  };
}

/**
 * Genera la lista de términos corregidos por glosario, extraída de
 * modificationsLog donde type === "glossary". Acotada por caso.
 * @param {object} cleanJson
 * @returns {object}
 */
export function buildGlossaryHits(cleanJson) {
  const hits = [];
  for (const segment of cleanJson.segments) {
    for (const entry of segment.modificationsLog) {
      if (entry.type === 'glossary') {
        hits.push({ wrong: entry.before, correct: entry.after, segmentId: segment.segmentId, count: 1 });
      }
    }
  }
  return {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'glossary-hits',
    hits: mergeGlossaryHits(hits),
  };
}

function mergeGlossaryHits(hits) {
  const merged = new Map();
  for (const hit of hits) {
    const key = `${hit.segmentId}::${hit.wrong}::${hit.correct}`;
    if (merged.has(key)) {
      merged.get(key).count += 1;
    } else {
      merged.set(key, { ...hit });
    }
  }
  return [...merged.values()];
}

/**
 * Genera la lista de segmentos problemáticos: anomalous:true y/o con
 * coincidencias NER sin revisar (sin entrada type:"human", ver
 * docs/DECISIONS.md §2.2 (4)) y/o confidence bajo un umbral configurable.
 * @param {object} cleanJson
 * @param {number} [confidenceThreshold=0.6]
 * @returns {object}
 */
export function buildFlaggedSegments(cleanJson, confidenceThreshold = 0.6) {
  const flagged = cleanJson.segments
    .filter((s) => {
      const hasUnreviewedNer = s.modificationsLog.some((e) => e.type === 'ner') && !isReviewed(s);
      const lowConfidence = typeof s.confidence === 'number' && s.confidence < confidenceThreshold;
      return s.anomalous || hasUnreviewedNer || lowConfidence;
    })
    .map((s) => s.segmentId);

  return {
    schemaVersion: '1.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'flagged-segments',
    segmentIds: flagged,
  };
}

function isReviewed(segment) {
  return segment.modificationsLog.some((entry) => entry.type === 'human');
}

const CSV_HEADERS_EDIT_LOG = ['segmentId', 'timestamp', 'type', 'before', 'after'];

// Marcador de redacción para el campo "before" de entradas type:"punctuation"
// en segmentos con PII (docs/DECISIONS.md §2.2 (5)). Se usa únicamente en
// esta vista derivada exportable; clean.json no se modifica por esta decisión.
const PUNCTUATION_REDACTION_MARKER = '<texto original, ver clean.json>';

/**
 * Genera la bitácora de edición aplanada: una fila por modificación de todos
 * los segmentos. Para type:"ner", before/after ya son placeholders,
 * nunca el valor real de la PII. Para type:"punctuation", si el segmento
 * tiene además alguna coincidencia NER (señal de que su texto crudo contiene
 * PII), el campo `before` se redacta con un marcador genérico en esta vista
 * exportable, a diferencia de clean.json (docs/DECISIONS.md §2.2 (5)).
 * @param {object} cleanJson
 * @returns {string}
 */
export function buildEditLogCsv(cleanJson) {
  const rows = [];
  for (const segment of cleanJson.segments) {
    const segmentHasNer = segment.modificationsLog.some((e) => e.type === 'ner');
    for (const entry of segment.modificationsLog) {
      // El Módulo A (punctuation) corre antes que el Módulo C (ner): tanto su
      // `before` como su `after` son texto crudo pre-anonimización cuando el
      // segmento contiene PII, así que ambos se redactan por igual en esta
      // vista exportable (docs/DECISIONS.md §2.2 (5)).
      const redact = entry.type === 'punctuation' && segmentHasNer;
      const before = redact ? PUNCTUATION_REDACTION_MARKER : entry.before;
      const after = redact ? PUNCTUATION_REDACTION_MARKER : entry.after;
      rows.push([segment.segmentId, entry.timestamp, entry.type, before, after]);
    }
  }
  return toCsv(CSV_HEADERS_EDIT_LOG, rows);
}

// --- utilidades CSV ---------------------------------------------------------

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function percentage(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 10000) / 100;
}

function average(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
