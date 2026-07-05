/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Construcción DOM de una única burbuja del guion (Vista de Diálogo
 * Continuo, Regla 4). Extraído de dialogue-view.js por límite de tamaño de
 * archivo (R10): esta es la única responsabilidad de este módulo, renderizar
 * un segmento (o su editor), sin manejar filtros, atajos ni estado global.
 */

import { computeWordDiff } from '../utils/word-diff.js';
import { isReviewed } from '../core/dialogue-filters.js';
import { formatSpeakerCovariateLabel } from '../core/covariate-summary.js';
import { buildButton, buildBadge } from './dom-helpers.js';

/**
 * Construye el elemento `<li>` de una burbuja de segmento, con su cabecera
 * (hablante, tiempo, insignias), motivo de anomalía si aplica, y su cuerpo
 * (resaltado de cambios + acciones, o el editor si está en edición).
 *
 * @param {object} segment
 * @param {{ isEditing: boolean, speakers?: object[], onFocus: Function, onAccept: Function,
 *           onStartEdit: Function, onSaveEdit: (text: string) => void }} handlers
 * @returns {HTMLLIElement}
 */
export function buildBubble(segment, handlers) {
  const reviewed = isReviewed(segment);
  const item = document.createElement('li');
  item.className = 'dialogue-bubble';
  item.dataset.segmentId = segment.segmentId;
  item.dataset.status = reviewed ? 'reviewed' : 'pending';
  item.dataset.anomalous = String(Boolean(segment.anomalous));
  item.tabIndex = 0;
  item.setAttribute('role', 'group');
  item.setAttribute('aria-label', `Segmento ${segment.segmentId}, hablante ${segment.speaker ?? segment.speakerId}`);
  item.addEventListener('focus', handlers.onFocus);

  item.appendChild(buildHeader(segment, reviewed, handlers.speakers));

  // Motivo legible de la anomalía (Regla de trazabilidad, mejora 2026-07):
  // explica POR QUÉ el segmento quedó marcado, en vez de un badge sin
  // contexto. Cubre el caso frecuente de "último segmento con duración
  // cero" originado en la etapa de transcripción automática previa.
  if (segment.anomalous && segment.anomalyReason) {
    item.appendChild(buildAnomalyReason(segment, item));
  }

  if (handlers.isEditing) {
    item.appendChild(buildEditor(segment, handlers.onSaveEdit));
  } else {
    item.appendChild(buildHighlightBlock(segment));
    item.appendChild(buildActions(segment, handlers));
  }

  return item;
}

function buildHeader(segment, reviewed, speakers) {
  const header = document.createElement('div');
  header.className = 'dialogue-bubble-header';

  const speakerEl = document.createElement('strong');
  speakerEl.className = 'dialogue-speaker';
  speakerEl.textContent = segment.speaker ?? segment.speakerId;
  header.appendChild(speakerEl);

  // Etiqueta de grupo/covariable (mejora 2026-07): visibilidad del dato que
  // ya viaja en speakers[].covariates (passthrough, Regla 1); no se calcula
  // ni infiere nada nuevo aquí, solo se muestra.
  const covariateLabel = formatSpeakerCovariateLabel(segment.speakerId, speakers);
  if (covariateLabel) {
    const covariateEl = document.createElement('span');
    covariateEl.className = 'dialogue-covariate muted';
    covariateEl.textContent = covariateLabel;
    header.appendChild(covariateEl);
  }

  const timeEl = document.createElement('span');
  timeEl.className = 'dialogue-time muted';
  timeEl.textContent = formatTimeRange(segment.start, segment.end);
  header.appendChild(timeEl);

  if (segment.anomalous) header.appendChild(buildBadge('ANÓMALO', 'danger'));
  header.appendChild(reviewed ? buildBadge('Revisado', 'success') : buildBadge('Pendiente', 'neutral'));

  return header;
}

function buildAnomalyReason(segment, item) {
  const reasonId = `anomaly-reason-${segment.segmentId}`;
  const reasonEl = document.createElement('p');
  reasonEl.className = 'anomaly-reason';
  reasonEl.id = reasonId;
  reasonEl.textContent = segment.anomalyReason;
  item.setAttribute('aria-describedby', reasonId);
  return reasonEl;
}

function buildActions(segment, handlers) {
  const actions = document.createElement('div');
  actions.className = 'segment-actions';
  actions.appendChild(buildButton('Aceptar (Alt+A)', () => handlers.onAccept(segment.segmentId), { variant: 'secondary' }));
  actions.appendChild(buildButton('Editar (Alt+E)', () => handlers.onStartEdit(segment.segmentId), { variant: 'ghost' }));
  return actions;
}

function buildHighlightBlock(segment) {
  const wrapper = document.createElement('p');
  wrapper.className = 'segment-text';
  const humanEntries = segment.modificationsLog.filter((e) => e.type === 'human');
  const lastHuman = humanEntries[humanEntries.length - 1];
  const before = lastHuman ? lastHuman.before : segment.originalText;
  const after = segment.cleanedText;

  const diff = computeWordDiff(before, after);
  for (const part of diff) {
    if (part.type === 'equal') {
      wrapper.appendChild(document.createTextNode(`${part.text} `));
    } else if (part.type === 'removed') {
      const del = document.createElement('del');
      del.className = 'diff-removed';
      del.textContent = part.text;
      wrapper.appendChild(del);
      wrapper.appendChild(document.createTextNode(' '));
    } else if (part.type === 'added') {
      const ins = document.createElement('ins');
      ins.className = 'diff-added';
      ins.textContent = part.text;
      wrapper.appendChild(ins);
      wrapper.appendChild(document.createTextNode(' '));
    }
  }
  return wrapper;
}

function buildEditor(segment, onSaveEdit) {
  const wrapper = document.createElement('div');
  wrapper.className = 'segment-editor';
  const textarea = document.createElement('textarea');
  textarea.value = segment.cleanedText;
  textarea.setAttribute('aria-label', `Editar texto del segmento ${segment.segmentId}`);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSaveEdit(textarea.value);
    }
  });
  wrapper.appendChild(textarea);

  const hint = document.createElement('p');
  hint.className = 'field-help';
  hint.textContent = 'Ctrl+Enter para guardar.';
  wrapper.appendChild(hint);

  wrapper.appendChild(buildButton('Guardar edición (Ctrl+Enter)', () => onSaveEdit(textarea.value), { variant: 'primary' }));

  // Foco inmediato en el editor: coherente con "preservar el foco del cursor" (Regla 4).
  queueMicrotask(() => textarea.focus());
  return wrapper;
}

/**
 * Formatea un rango de tiempo `start`–`end` en segundos como `mm:ss–mm:ss`.
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function formatTimeRange(start, end) {
  const format = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  return `${format(start)}–${format(end)}`;
}
