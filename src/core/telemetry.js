/**
 * Módulo D: telemetría por segmento (duración, wpm, anomalías). Fórmula
 * exacta en docs/CONTRACTS.md §8. Ver docs/DECISIONS.md sobre por qué se
 * aplica literalmente aunque un fixture antiguo tenga valores distintos.
 *
 * Genera además `reason` (motivo legible de por qué un segmento quedó
 * marcado `anomalous`), para que la UI explique la causa en vez de mostrar
 * solo un indicador visual sin contexto (docs/DECISIONS.md, mejora 2026-07).
 */

// Umbrales fijos definidos en docs/CONTRACTS.md §9.
const WPM_HIGH_THRESHOLD = 220;
const WPM_LOW_THRESHOLD = 40;
const PAUSE_ANOMALY_THRESHOLD_SECONDS = 5.0;

/**
 * Calcula la telemetría de un segmento: duración, conteo de palabras, wpm
 * (palabras por minuto), marca de anomalía y motivo legible, según la
 * fórmula literal de docs/CONTRACTS.md §9:
 *
 *   duration   = end - start
 *   wordCount  = longitud(split(cleanedText))
 *   wpm        = (wordCount / duration) * 60
 *   anomalous  = wpm > 220 OR wpm < 40 OR (start[n] - end[n-1]) > 5.0
 *
 * Función pura y defensiva: si `duration` es 0 (o negativa por datos
 * corruptos), no se divide por cero; el segmento se marca `anomalous: true`
 * explícitamente. No conoce la posición del segmento en la entrevista (eso
 * lo añade clean-pipeline.js, ver `enrichLastSegmentReason`).
 *
 * @param {{ cleanedText: string, start: number, end: number }} segment
 * @param {number|null} previousSegmentEnd - `end` del segmento anterior en la
 *   misma entrevista, o `null` si es el primer segmento (sin pausa previa que evaluar).
 * @returns {{ duration: number, wordCount: number, wpm: number, anomalous: boolean, note: string|null, reason: string|null }}
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
    // Mensaje en lenguaje simple (2026-07): la versión anterior usaba notación
    // técnica ("<= 0 segundos", "no se pudo calcular wpm"), inconsistente con
    // el resto de la interfaz, pensada para investigadores, no programadores.
    const note = 'El inicio y el final de este segmento son iguales, así que no se pudo calcular el ritmo de habla.';
    return { duration, wordCount, wpm: 0, anomalous: true, note, reason: note };
  }

  const wpm = (wordCount / duration) * 60;
  const longPause = hasLongPause(segment.start, previousSegmentEnd);
  const reasons = [];
  if (wpm > WPM_HIGH_THRESHOLD) {
    reasons.push('Ritmo de habla inusualmente alto (posible error de transcripción o superposición de hablantes).');
  }
  if (wpm < WPM_LOW_THRESHOLD) {
    reasons.push('Ritmo de habla inusualmente bajo (posible pausa larga dentro del segmento o transcripción incompleta).');
  }
  if (longPause) {
    reasons.push('Pausa larga respecto al segmento anterior (más de 5 segundos).');
  }
  const anomalous = reasons.length > 0;
  const reason = anomalous ? reasons.join(' ') : null;

  return { duration, wordCount, wpm, anomalous, note: reason, reason };
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

/**
 * Enriquece el motivo de anomalía por duración cero cuando el segmento es el
 * ÚLTIMO de la entrevista: en la práctica este patrón (start === end en el
 * último segmento) aparece de forma recurrente cuando la etapa de
 * transcripción automática (ASR) no logra determinar el timestamp final del
 * último fragmento de audio, y propaga un valor de reserva (duración cero)
 * en su lugar — no es un dato corrupto ni un error del archivo. No se
 * referencia ninguna unidad del ecosistema por nombre (agnóstico a la fuente
 * de transcripción), ver docs/DECISIONS.md.
 *
 * @param {string|null} reason - motivo calculado por computeTelemetry.
 * @param {number} duration
 * @param {boolean} isLastSegment
 * @returns {string|null}
 */
export function enrichLastSegmentReason(reason, duration, isLastSegment) {
  if (duration > 0 || !isLastSegment) return reason;
  return `${reason} Esto es normal en el último segmento: el programa que transcribió el audio no siempre detecta bien dónde termina la última parte.`;
}

