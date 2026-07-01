/**
 * Módulo D: telemetría por segmento (duración, wpm, anomalías). Fórmula
 * exacta en docs/CONTRACTS.md §8. Ver docs/DECISIONS.md sobre por qué se
 * aplica literalmente aunque un fixture antiguo tenga valores distintos.
 */

// Umbrales fijos definidos en docs/CONTRACTS.md §9.
const WPM_HIGH_THRESHOLD = 220;
const WPM_LOW_THRESHOLD = 40;
const PAUSE_ANOMALY_THRESHOLD_SECONDS = 5.0;

/**
 * Calcula la telemetría de un segmento: duración, conteo de palabras, wpm
 * (palabras por minuto) y marca de anomalía, según la fórmula literal de
 * docs/CONTRACTS.md §9:
 *
 *   duration   = end - start
 *   wordCount  = longitud(split(cleanedText))
 *   wpm        = (wordCount / duration) * 60
 *   anomalous  = wpm > 220 OR wpm < 40 OR (start[n] - end[n-1]) > 5.0
 *
 * Función pura y defensiva: si `duration` es 0 (o negativa por datos
 * corruptos), no se divide por cero; el segmento se marca `anomalous: true`
 * explícitamente.
 *
 * @param {{ cleanedText: string, start: number, end: number }} segment
 * @param {number|null} previousSegmentEnd - `end` del segmento anterior en la
 *   misma entrevista, o `null` si es el primer segmento (sin pausa previa que evaluar).
 * @returns {{ duration: number, wordCount: number, wpm: number, anomalous: boolean, note: string|null }}
 */
export function computeTelemetry(segment, previousSegmentEnd) {
  if (segment === null || typeof segment !== 'object') {
    throw new Error('El segmento para calcular telemetría no es válido.');
  }
  if (typeof segment.cleanedText !== 'string') {
    throw new Error('El segmento no tiene "cleanedText" válido para calcular telemetría.');
  }
  if (typeof segment.start !== 'number' || typeof segment.end !== 'number') {
    throw new Error('El segmento no tiene "start"/"end" numéricos válidos para calcular telemetría.');
  }

  const duration = segment.end - segment.start;
  const wordCount = countWords(segment.cleanedText);

  if (duration <= 0) {
    // División por cero (o duración inválida) manejada sin romper el pipeline:
    // se marca anómalo con nota explícita, wpm queda en 0 en vez de Infinity/NaN.
    return {
      duration,
      wordCount,
      wpm: 0,
      anomalous: true,
      note: 'Duración del segmento inválida (<= 0 segundos); no se pudo calcular wpm.',
    };
  }

  const wpm = (wordCount / duration) * 60;
  const longPause = hasLongPause(segment.start, previousSegmentEnd);
  const anomalous = wpm > WPM_HIGH_THRESHOLD || wpm < WPM_LOW_THRESHOLD || longPause;

  return {
    duration,
    wordCount,
    wpm,
    anomalous,
    note: null,
  };
}

/**
 * Cuenta palabras separando por espacios en blanco, ignorando cadenas vacías
 * resultantes de espacios múltiples.
 */
function countWords(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/**
 * Determina si la pausa respecto al segmento anterior supera el umbral.
 * Si no hay segmento anterior (primer segmento de la entrevista), no aplica.
 */
function hasLongPause(currentStart, previousSegmentEnd) {
  if (previousSegmentEnd === null || previousSegmentEnd === undefined) {
    return false;
  }
  return currentStart - previousSegmentEnd > PAUSE_ANOMALY_THRESHOLD_SECONDS;
}
