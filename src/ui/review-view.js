/**
 * Lógica pura (sin DOM) de la revisión humana: aceptar/editar segmentos,
 * congelar cleanedText tras finalizar (docs/CONTRACTS.md §4), priorizar la
 * cola de revisión, y el diff por conjunto de palabras usado como base del
 * resaltado visual (ver src/utils/word-diff.js y docs/DECISIONS.md para el
 * diff posicional real que usa la UI). "Revisado" = al menos una entrada
 * type:"human" en modificationsLog — no hay campo nuevo en el esquema.
 * El renderizado en el DOM vive en src/ui/review-screen.js.
 */

/**
 * Marca un segmento como aceptado sin cambios: agrega una entrada type:"human"
 * de confirmación (before === after === cleanedText actual) y activa
 * editedByHuman. Esto satisface docs/DECISIONS.md §2.2 (4): el segmento
 * queda "revisado" aunque no se haya editado el texto.
 *
 * @param {object} segment - segmento de clean.json (ver API-CONTRACTS.md §4)
 * @returns {object} nuevo objeto de segmento actualizado (no muta el original)
 */
export function acceptSegment(segment) {
  assertNotFinalizedGuardNotApplicable(segment);
  const entry = buildHumanLogEntry(segment.cleanedText, segment.cleanedText);
  return {
    ...segment,
    editedByHuman: true,
    modificationsLog: [...segment.modificationsLog, entry],
  };
}

/**
 * Edita manualmente el cleanedText de un segmento, agregando la entrada
 * type:"human" correspondiente. Regla dura: rechaza la edición si el
 * segmento pertenece a un caso ya finalizado (finalizedByHuman:true en el
 * cleanJson que lo contiene) — ver el segundo parámetro `finalizedByHuman`.
 *
 * @param {object} segment
 * @param {string} newCleanedText
 * @param {boolean} finalizedByHuman - valor de auditLog.finalizedByHuman del clean.json.
 * @returns {object} nuevo objeto de segmento actualizado
 */
export function editSegment(segment, newCleanedText, finalizedByHuman) {
  if (finalizedByHuman) {
    throw new Error('No se puede modificar el texto: esta entrevista ya fue finalizada. Genere una nueva versión del archivo.');
  }
  if (typeof newCleanedText !== 'string') {
    throw new Error('El nuevo texto del segmento no es válido.');
  }
  const entry = buildHumanLogEntry(segment.cleanedText, newCleanedText);
  return {
    ...segment,
    cleanedText: newCleanedText,
    editedByHuman: true,
    modificationsLog: [...segment.modificationsLog, entry],
  };
}

function assertNotFinalizedGuardNotApplicable() {
  // acceptSegment no recibe finalizedByHuman explícitamente porque aceptar sin
  // cambios antes de finalizar es el flujo normal; la regla dura de congelación
  // se aplica en editSegment y en finalizeCleanJson/canFinalize.
}

function buildHumanLogEntry(before, after) {
  return { timestamp: new Date().toISOString(), type: 'human', before, after };
}

/**
 * Determina si un segmento ya fue revisado por un humano: tiene al menos una
 * entrada type:"human" en su modificationsLog (docs/DECISIONS.md §2.2 (4)).
 *
 * @param {object} segment
 * @returns {boolean}
 */
export function isSegmentReviewed(segment) {
  return Array.isArray(segment.modificationsLog) && segment.modificationsLog.some((entry) => entry.type === 'human');
}

/**
 * Verifica si un clean.json puede finalizarse: todos los segmentos con
 * anomalous:true deben estar revisados (ver isSegmentReviewed).
 *
 * @param {object} cleanJson
 * @returns {{ ok: boolean, pendingSegmentIds: string[] }}
 */
export function canFinalize(cleanJson) {
  const pendingSegmentIds = cleanJson.segments
    .filter((segment) => segment.anomalous && !isSegmentReviewed(segment))
    .map((segment) => segment.segmentId);
  return { ok: pendingSegmentIds.length === 0, pendingSegmentIds };
}

/**
 * Finaliza el clean.json: activa auditLog.finalizedByHuman = true. A partir
 * de ese momento, cleanedText queda congelado (editSegment debe rechazar
 * cambios pasando finalizedByHuman=true). Lanza error si aún hay segmentos
 * anómalos sin revisar.
 *
 * @param {object} cleanJson
 * @returns {object} nuevo cleanJson con auditLog actualizado
 */
export function finalizeCleanJson(cleanJson) {
  const { ok, pendingSegmentIds } = canFinalize(cleanJson);
  if (!ok) {
    throw new Error(
      `No se puede finalizar: quedan segmentos anómalos sin revisar (${pendingSegmentIds.join(', ')}).`,
    );
  }
  return {
    ...cleanJson,
    auditLog: {
      ...cleanJson.auditLog,
      finalizedByHuman: true,
      lastModified: new Date().toISOString(),
    },
  };
}

// Orden de prioridad de la cola de revisión (docs/DECISIONS.md §2.3):
// primero anómalos, luego con coincidencias NER, luego con sustituciones de glosario,
// luego confianza baja (<0.6), el resto al final.
const PRIORITY_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Reordena (sin mutar) los segmentos para la cola de revisión priorizando
 * los más riesgosos primero: anómalos, con NER, con glosario, con confianza
 * baja. No cambia el contrato de datos, solo el orden de presentación.
 *
 * @param {object[]} segments
 * @returns {object[]} nuevo array reordenado
 */
export function sortSegmentsForReview(segments) {
  return [...segments].sort((a, b) => priorityScore(b) - priorityScore(a));
}

function priorityScore(segment) {
  let score = 0;
  if (segment.anomalous) score += 8;
  if (hasLogType(segment, 'ner')) score += 4;
  if (hasLogType(segment, 'glossary')) score += 2;
  if (typeof segment.confidence === 'number' && segment.confidence < PRIORITY_CONFIDENCE_THRESHOLD) score += 1;
  return score;
}

function hasLogType(segment, type) {
  return Array.isArray(segment.modificationsLog) && segment.modificationsLog.some((entry) => entry.type === type);
}

/**
 * Calcula los tramos de texto para el resaltado tipo "control de cambios"
 * (docs/DECISIONS.md §2.2), comparando `before` y `after`
 * palabra por palabra. Cálculo puro; el renderizado visual (tachado/
 * subrayado) es responsabilidad de una capa de presentación DOM futura.
 *
 * @param {string} before
 * @param {string} after
 * @returns {{ removed: string[], added: string[] }}
 */
export function buildChangeHighlight(before, after) {
  const beforeWords = before.split(/\s+/).filter(Boolean);
  const afterWords = after.split(/\s+/).filter(Boolean);
  const beforeSet = new Set(beforeWords);
  const afterSet = new Set(afterWords);

  return {
    removed: beforeWords.filter((word) => !afterSet.has(word)),
    added: afterWords.filter((word) => !beforeSet.has(word)),
  };
}
