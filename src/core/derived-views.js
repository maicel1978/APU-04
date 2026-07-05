/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Genera las vistas derivadas ([base]_cleaned.csv, [base]_quality_report.json,
 * [base]_edit_log.csv) siempre a partir de cleanJson; nunca se editan a mano.
 * Ver docs/CONTRACTS.md §5,7,8. Todas las funciones reciben solo `cleanJson`,
 * nunca `piiBuffer`: estructuralmente imposible que filtren PII real.
 * Excepción: `buildEditLogCsv` redacta el campo `before`/`after` de la entrada
 * type:"punctuation" cuando el segmento tiene coincidencias NER (a diferencia
 * de cleanJson, que sí conserva ese texto crudo — ver docs/DECISIONS.md).
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

const CSV_HEADERS_CLEAN_BASE = ['segmentId', 'start', 'end', 'speakerId', 'speaker', 'cleanedText', 'wpm', 'anomalous', 'confidence'];

/**
 * Genera la vista tabular por segmento (CSV), con columnas dinámicas de
 * covariables tomadas de speakers[].covariates del hablante de cada
 * segmento (docs/CONTRACTS.md §5). Prefijo "cv_" para evitar colisión con
 * las columnas fijas. La unión de todas las claves de covariables presentes
 * define las columnas; celdas sin valor para un hablante quedan vacías.
 * @param {object} cleanJson
 * @returns {string}
 */
export function buildCleanCsv(cleanJson) {
  const speakerById = indexSpeakersById(cleanJson.speakers);
  const covariateKeys = collectCovariateKeys(cleanJson.speakers);
  const headers = [...CSV_HEADERS_CLEAN_BASE, ...covariateKeys.map((k) => `cv_${k}`)];

  const rows = cleanJson.segments.map((s) => {
    const speaker = speakerById.get(s.speakerId);
    const covariates = speaker?.covariates ?? {};
    const covariateCells = covariateKeys.map((key) => (key in covariates ? covariates[key] : ''));
    return [s.segmentId, s.start ?? '', s.end ?? '', s.speakerId ?? '', s.speaker ?? '', s.cleanedText, s.wpm, s.anomalous, s.confidence, ...covariateCells];
  });

  return toCsv(headers, rows);
}

function indexSpeakersById(speakers) {
  const map = new Map();
  for (const speaker of Array.isArray(speakers) ? speakers : []) {
    if (speaker && typeof speaker.id === 'string') {
      map.set(speaker.id, speaker);
    }
  }
  return map;
}

function collectCovariateKeys(speakers) {
  const keys = new Set();
  for (const speaker of Array.isArray(speakers) ? speakers : []) {
    const covariates = speaker?.covariates;
    if (covariates && typeof covariates === 'object') {
      for (const key of Object.keys(covariates)) keys.add(key);
    }
  }
  return [...keys].sort();
}

// Umbrales de conteo de "términos sospechosos" para el dashboard (Regla 2 del
// encargo): un segmento aporta al conteo si tuvo al menos una sustitución de
// glosario (indicio de término de dominio corregido) o una coincidencia NER
// sin revisar (indicio de posible dato sensible aún no confirmado).
function countSuspiciousTerms(segments) {
  return segments.reduce((count, s) => {
    const hasGlossaryHit = s.modificationsLog.some((e) => e.type === 'glossary');
    return hasGlossaryHit ? count + 1 : count;
  }, 0);
}

function countLongPauses(segments) {
  let count = 0;
  let previousEnd = null;
  for (const s of segments) {
    if (previousEnd !== null && typeof s.start === 'number' && s.start - previousEnd > 5.0) {
      count += 1;
    }
    previousEnd = s.end;
  }
  return count;
}

/**
 * Genera el reporte de calidad agregado por archivo (docs/CONTRACTS.md §7),
 * con las métricas de la Regla 2 del encargo (conteo de palabras, wpm,
 * pausas >5s, términos sospechosos) además de las heredadas de v1.
 * @param {object} cleanJson
 * @returns {object}
 */
export function buildQualityReport(cleanJson) {
  const segments = cleanJson.segments;
  const total = segments.length;
  const editedCount = segments.filter((s) => s.editedByHuman).length;
  const anomalousCount = segments.filter((s) => s.anomalous).length;
  const wpmValues = segments.map((s) => s.wpm);
  const totalWords = segments.reduce((sum, s) => sum + countWords(s.cleanedText), 0);

  const substitutionCounts = { punctuation: 0, glossary: 0, ner: 0, human: 0 };
  for (const segment of segments) {
    for (const entry of segment.modificationsLog) {
      if (entry.type in substitutionCounts) {
        substitutionCounts[entry.type] += 1;
      }
    }
  }

  return {
    schemaVersion: '5.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'quality-report',
    totalSegments: total,
    totalWords,
    wpmAverage: wpmValues.length ? round2(average(wpmValues)) : 0,
    longPauseCount: countLongPauses(segments),
    anomalousCount,
    anomalousPercentage: percentage(anomalousCount, total),
    editedByHumanPercentage: percentage(editedCount, total),
    suspiciousTermsCount: countSuspiciousTerms(segments),
    substitutionCounts,
    flaggedSegmentIds: buildFlaggedSegmentIds(segments),
  };
}

function countWords(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

function buildFlaggedSegmentIds(segments) {
  return segments
    .filter((s) => {
      const hasUnreviewedNer = s.modificationsLog.some((e) => e.type === 'ner') && !isReviewed(s);
      const lowConfidence = typeof s.confidence === 'number' && s.confidence < 0.6;
      return s.anomalous || hasUnreviewedNer || lowConfidence;
    })
    .map((s) => s.segmentId);
}

function isReviewed(segment) {
  return segment.modificationsLog.some((entry) => entry.type === 'human');
}

/**
 * Lista de segmentos problemáticos como documento independiente (útil para
 * enlazar directamente desde el Dashboard APU-04D sin recalcular el reporte
 * completo). Delegando en la misma lógica que buildQualityReport.
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
    schemaVersion: '5.0.0',
    ecosystem: 'APU',
    unit: 'APU-04',
    stage: 'flagged-segments',
    segmentIds: flagged,
  };
}

const CSV_HEADERS_EDIT_LOG = ['segmentId', 'timestamp', 'type', 'before', 'after'];

// Marcador de redacción para el campo "before"/"after" de entradas
// type:"punctuation" en segmentos con PII (docs/DECISIONS.md). Se usa
// únicamente en esta vista derivada exportable; cleanJson no se modifica.
const PUNCTUATION_REDACTION_MARKER = '<texto original, ver cleaned.json>';

/**
 * Genera la bitácora de edición aplanada: una fila por modificación de todos
 * los segmentos (docs/CONTRACTS.md §8). Para type:"ner", before/after ya son
 * placeholders relacionales, nunca el valor real. Para type:"punctuation",
 * si el segmento tiene además alguna coincidencia NER, before/after se
 * redactan con un marcador genérico en esta vista exportable.
 * @param {object} cleanJson
 * @returns {string}
 */
export function buildEditLogCsv(cleanJson) {
  const rows = [];
  for (const segment of cleanJson.segments) {
    const segmentHasNer = segment.modificationsLog.some((e) => e.type === 'ner');
    for (const entry of segment.modificationsLog) {
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

function round2(value) {
  return Math.round(value * 100) / 100;
}
