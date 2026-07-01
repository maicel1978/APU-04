/**
 * Pantalla de revisión humana: tarjetas por segmento con insignias de
 * estado, resaltado de cambios (diff posicional real, src/utils/word-diff.js),
 * cola priorizada por riesgo (src/ui/review-view.js), y barra de finalización.
 * Contrato DOM estable para pruebas: `li[data-segment-id]`, textos de
 * botones ("Aceptar sin cambios", "Editar texto", "Finalizar revisión..."),
 * roles ARIA — no cambiar sin actualizar tests/apu04-review-screen.dom.test.mjs
 * y tests/apu04-app.dom.test.mjs. Probado con jsdom.
 */

import {
  acceptSegment,
  editSegment,
  canFinalize,
  finalizeCleanJson,
  sortSegmentsForReview,
} from './review-view.js';
import { computeWordDiff } from '../utils/word-diff.js';
import { buildButton, buildBadge } from './dom-helpers.js';

/**
 * Renderiza la pantalla de revisión humana para un
 * `cleanJson` completo. Muta su propia copia local del estado (nunca el
 * objeto recibido) y llama a `onProgress(cleanJsonActualizado)` después de
 * cada acción del usuario (para autoguardado, ver app.js/session-store.js),
 * y a `onFinalize(cleanJsonFinalizado)` cuando el usuario finaliza con éxito.
 *
 * @param {HTMLElement} container
 * @param {object} cleanJson
 * @param {(cleanJson: object) => void} onProgress
 * @param {(cleanJson: object) => void} onFinalize
 */
export function renderReviewScreen(container, cleanJson, onProgress, onFinalize) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la pantalla de revisión.');
  }

  let state = cleanJson;

  function rerender() {
    container.innerHTML = '';
    container.appendChild(buildHeaderCard());
    container.appendChild(buildQueue());
    container.appendChild(buildFinalizeBar());
  }

  function buildHeaderCard() {
    const card = document.createElement('div');
    card.className = 'card';

    const heading = document.createElement('h2');
    heading.textContent = 'Revisión de la entrevista';
    card.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'section-hint';
    hint.textContent = 'Revise cada segmento marcado como anómalo antes de continuar. Los demás son opcionales.';
    card.appendChild(hint);

    const total = state.segments.length;
    const reviewedCount = state.segments.filter((s) => hasHumanEntry(s)).length;
    const status = document.createElement('p');
    status.className = 'status-line';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = `Segmentos: ${total}. Revisados: ${reviewedCount}.`;
    card.appendChild(status);

    return card;
  }

  function buildQueue() {
    const list = document.createElement('ol');
    list.className = 'segment-list';
    list.setAttribute('aria-label', 'Cola de revisión, priorizada por riesgo');
    const ordered = sortSegmentsForReview(state.segments);
    for (const segment of ordered) {
      list.appendChild(buildSegmentItem(segment));
    }
    return list;
  }

  function buildSegmentItem(segment) {
    const reviewed = hasHumanEntry(segment);
    const item = document.createElement('li');
    item.className = 'segment-card';
    item.dataset.segmentId = segment.segmentId;
    item.dataset.status = reviewed ? 'reviewed' : 'pending';
    item.dataset.anomalous = String(Boolean(segment.anomalous));

    const header = document.createElement('div');
    header.className = 'segment-header';

    const title = document.createElement('strong');
    title.className = 'segment-title';
    title.innerHTML = '';
    title.appendChild(document.createTextNode(`Segmento ${segment.segmentId}`));
    if (segment.anomalous) {
      title.appendChild(document.createTextNode(' — '));
      const flag = document.createElement('span');
      flag.className = 'segment-flag';
      flag.textContent = 'ANÓMALO';
      title.appendChild(flag);
    }
    header.appendChild(title);

    const badges = document.createElement('div');
    badges.className = 'segment-badges';
    badges.appendChild(
      reviewed ? buildBadge('(revisado)', 'success') : buildBadge('(pendiente)', segment.anomalous ? 'danger' : 'neutral'),
    );
    header.appendChild(badges);

    item.appendChild(header);
    item.appendChild(buildHighlightBlock(segment));

    const actions = document.createElement('div');
    actions.className = 'segment-actions';
    actions.appendChild(
      buildButton('Aceptar sin cambios', () => handleAccept(segment.segmentId), { variant: 'secondary' }),
    );
    actions.appendChild(buildButton('Editar texto', () => toggleEditor(item, segment), { variant: 'ghost' }));
    item.appendChild(actions);

    return item;
  }

  function buildHighlightBlock(segment) {
    const wrapper = document.createElement('p');
    wrapper.className = 'segment-text';
    const humanEntries = segment.modificationsLog.filter((entry) => entry.type === 'human');
    const lastHuman = humanEntries[humanEntries.length - 1];
    const before = lastHuman ? lastHuman.before : segment.originalText;
    const after = segment.cleanedText;

    // Diff posicional real (src/utils/word-diff.js), no por conjunto: preserva
    // el orden del texto y evita que palabras repetidas en ambas versiones
    // (p. ej. "no", "eh") se muestren como si se hubieran perdido.
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

  function toggleEditor(item, segment) {
    if (item.querySelector('textarea')) return; // ya está abierto
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'segment-editor';

    const textarea = document.createElement('textarea');
    textarea.value = segment.cleanedText;
    textarea.setAttribute('aria-label', `Editar texto del segmento ${segment.segmentId}`);
    editorWrapper.appendChild(textarea);

    const saveButton = buildButton('Guardar edición', () => handleEdit(segment.segmentId, textarea.value), {
      variant: 'primary',
    });
    editorWrapper.appendChild(saveButton);

    item.appendChild(editorWrapper);
    textarea.focus();
  }

  function buildFinalizeBar() {
    const bar = document.createElement('div');
    bar.className = 'finalize-bar';
    const { ok, pendingSegmentIds } = canFinalize(state);

    const finalizeButton = buildButton('Finalizar revisión y bloquear texto', handleFinalize, {
      variant: 'primary',
      block: true,
    });
    finalizeButton.disabled = !ok;
    bar.appendChild(finalizeButton);

    const pendingBox = document.createElement('p');
    pendingBox.className = `alert${ok ? ' is-hidden' : ''}`;
    pendingBox.setAttribute('role', 'alert');
    pendingBox.setAttribute('aria-live', 'assertive');
    pendingBox.textContent = ok
      ? ''
      : `Quedan segmentos anómalos sin revisar: ${pendingSegmentIds.join(', ')}.`;
    bar.appendChild(pendingBox);

    return bar;
  }

  function handleAccept(segmentId) {
    updateSegment(segmentId, (segment) => acceptSegment(segment));
  }

  function handleEdit(segmentId, newText) {
    try {
      updateSegment(segmentId, (segment) =>
        editSegment(segment, newText, state.auditLog.finalizedByHuman),
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar la edición.');
    }
  }

  function updateSegment(segmentId, transform) {
    state = {
      ...state,
      segments: state.segments.map((segment) =>
        segment.segmentId === segmentId ? transform(segment) : segment,
      ),
    };
    onProgress(state);
    rerender();
  }

  function handleFinalize() {
    try {
      state = finalizeCleanJson(state);
      onProgress(state);
      onFinalize(state);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo finalizar la revisión.');
      rerender();
    }
  }

  rerender();
}

function hasHumanEntry(segment) {
  return segment.modificationsLog.some((entry) => entry.type === 'human');
}
