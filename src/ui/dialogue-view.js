/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Vista de Diálogo Continuo (Regla 4): guion/chat continuo con barra de
 * herramientas superior (filtrar por estado/hablante, búsqueda instantánea
 * preservando el foco) y atajos de teclado (Alt+A aceptar, Alt+E editar,
 * Ctrl+Enter guardar, Alt+F finalizar, Alt+↓/↑ saltar entre pendientes).
 * Reutiliza sin cambios src/ui/review-view.js; la construcción DOM de cada
 * burbuja vive en src/ui/dialogue-bubble.js (dividido por límite R10).
 *
 * Decisión de UX crítica: la barra de herramientas (incluida la búsqueda) se
 * construye UNA sola vez y nunca se destruye; solo la lista de segmentos se
 * reemplaza en cada filtrado/acción, para no perder el foco del cursor.
 * Mejora 2026-07: tras Aceptar/Guardar, el foco avanza solo al siguiente
 * pendiente (ver docs/DECISIONS.md).
 */

import { acceptSegment, editSegment, canFinalize, finalizeCleanJson } from './review-view.js';
import { filterSegments, collectSpeakersInSegments, isReviewed } from '../core/dialogue-filters.js';
import { collectCovariateOptions } from '../core/covariate-summary.js';
import { buildBubble } from './dialogue-bubble.js';
import { buildButton, setAlertText } from './dom-helpers.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'anomalous', label: 'Anómalos' },
  { value: 'reviewed', label: 'Revisados' },
];

/**
 * Renderiza la Vista de Diálogo Continuo dentro de `container` para un
 * `cleanJson` completo de un caso. Llama a `onProgress(cleanJson)` tras cada
 * acción (autoguardado) y a `onFinalize(cleanJson)` al finalizar con éxito.
 *
 * @param {HTMLElement} container
 * @param {object} cleanJson
 * @param {(cleanJson: object) => void} onProgress
 * @param {(cleanJson: object) => void} onFinalize
 */
export function renderDialogueView(container, cleanJson, onProgress, onFinalize) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la vista de diálogo.');
  }

  let state = cleanJson;
  let filters = { status: 'all', speakerId: 'all', covariate: null, query: '' };
  let activeSegmentId = null;
  let editingSegmentId = null;

  container.innerHTML = '';

  const toolbar = buildToolbar();
  container.appendChild(toolbar.element);

  const statusLine = document.createElement('p');
  statusLine.className = 'status-line';
  statusLine.setAttribute('role', 'status');
  statusLine.setAttribute('aria-live', 'polite');
  container.appendChild(statusLine);

  const listContainer = document.createElement('div');
  container.appendChild(listContainer);

  const finalizeBar = document.createElement('div');
  finalizeBar.className = 'finalize-bar';
  container.appendChild(finalizeBar);

  document.addEventListener('keydown', handleGlobalKeydown);

  renderList();

  function buildToolbar() {
    const element = document.createElement('div');
    element.className = 'dialogue-toolbar';
    element.setAttribute('role', 'toolbar');
    element.setAttribute('aria-label', 'Filtros de la vista de diálogo');

    const statusGroup = document.createElement('div');
    statusGroup.className = 'toolbar-group';
    statusGroup.setAttribute('role', 'group');
    statusGroup.setAttribute('aria-label', 'Filtrar por estado');
    const statusButtons = new Map();
    for (const option of STATUS_OPTIONS) {
      const button = buildButton(option.label, () => {
        filters = { ...filters, status: option.value };
        for (const [value, btn] of statusButtons) {
          btn.setAttribute('aria-pressed', String(value === option.value));
        }
        renderList();
      }, { variant: option.value === 'all' ? 'primary' : 'ghost' });
      button.setAttribute('aria-pressed', String(option.value === 'all'));
      statusButtons.set(option.value, button);
      statusGroup.appendChild(button);
    }
    element.appendChild(statusGroup);

    const speakerSelect = document.createElement('select');
    speakerSelect.setAttribute('aria-label', 'Filtrar por hablante');
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todos los hablantes';
    speakerSelect.appendChild(allOption);
    for (const speaker of collectSpeakersInSegments(state.segments)) {
      const option = document.createElement('option');
      option.value = speaker.speakerId;
      option.textContent = speaker.label;
      speakerSelect.appendChild(option);
    }
    speakerSelect.addEventListener('change', () => {
      filters = { ...filters, speakerId: speakerSelect.value };
      renderList();
    });
    element.appendChild(speakerSelect);

    // Filtro por covariable (mejora 2026-07): solo aparece si hay al menos
    // una covariable en speakers[] (p. ej. grupo de estudio, sitio); si el
    // archivo no usó VarOps, este selector simplemente no se muestra.
    const covariateOptions = collectCovariateOptions(state.speakers);
    if (covariateOptions.length > 0) {
      const covariateSelect = document.createElement('select');
      covariateSelect.setAttribute('aria-label', 'Filtrar por grupo u otra variable del estudio');
      const allCovariateOption = document.createElement('option');
      allCovariateOption.value = '';
      allCovariateOption.textContent = 'Todos los grupos';
      covariateSelect.appendChild(allCovariateOption);
      for (const option of covariateOptions) {
        const optionEl = document.createElement('option');
        optionEl.value = `${option.key}\u0000${option.value}`;
        optionEl.textContent = option.label;
        covariateSelect.appendChild(optionEl);
      }
      covariateSelect.addEventListener('change', () => {
        filters = { ...filters, covariate: covariateSelect.value || null };
        renderList();
      });
      element.appendChild(covariateSelect);
    }

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar en el texto…';
    searchInput.setAttribute('aria-label', 'Búsqueda instantánea de texto');
    searchInput.addEventListener('input', () => {
      filters = { ...filters, query: searchInput.value };
      renderList(); // Solo la lista se reemplaza: searchInput nunca se recrea (foco preservado).
    });
    element.appendChild(searchInput);

    return { element, searchInput };
  }

  function renderList() {
    listContainer.innerHTML = '';
    const filtered = filterSegments(state.segments, filters, state.speakers);

    const total = state.segments.length;
    const reviewedCount = state.segments.filter((s) => isReviewed(s)).length;
    statusLine.textContent = `Mostrando ${filtered.length} de ${total} segmentos. Revisados: ${reviewedCount}/${total}.`;

    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Ningún segmento coincide con los filtros actuales.';
      listContainer.appendChild(empty);
    } else {
      const list = document.createElement('ol');
      list.className = 'dialogue-list';
      list.setAttribute('aria-label', 'Guion de la entrevista');
      for (const segment of filtered) {
        list.appendChild(
          buildBubble(segment, {
            isEditing: editingSegmentId === segment.segmentId,
            speakers: state.speakers,
            onFocus: () => {
              activeSegmentId = segment.segmentId;
            },
            onAccept: handleAccept,
            onStartEdit: startEditing,
            onSaveEdit: (text) => handleEdit(segment.segmentId, text),
          }),
        );
      }
      listContainer.appendChild(list);
    }

    renderFinalizeBar();
  }

  function renderFinalizeBar() {
    finalizeBar.innerHTML = '';
    const { ok, pendingSegmentIds } = canFinalize(state);

    const finalizeButton = buildButton('Finalizar (Alt+F)', handleFinalize, { variant: 'primary', block: true });
    finalizeButton.disabled = !ok;
    finalizeBar.appendChild(finalizeButton);

    const pendingBox = document.createElement('p');
    pendingBox.className = 'alert';
    pendingBox.setAttribute('role', 'alert');
    pendingBox.setAttribute('aria-live', 'assertive');
    setAlertText(pendingBox, ok ? '' : `Quedan segmentos anómalos sin revisar: ${pendingSegmentIds.join(', ')}.`);
    finalizeBar.appendChild(pendingBox);
  }

  function startEditing(segmentId) {
    editingSegmentId = segmentId;
    renderList();
  }

  function handleAccept(segmentId) {
    updateSegment(segmentId, (segment) => acceptSegment(segment));
    focusAdjacentPending(segmentId, 1);
  }

  function handleEdit(segmentId, newText) {
    try {
      updateSegment(segmentId, (segment) => editSegment(segment, newText, state.auditLog.finalizedByHuman));
      editingSegmentId = null;
      focusAdjacentPending(segmentId, 1);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar la edición.');
    }
  }

  function updateSegment(segmentId, transform) {
    state = { ...state, segments: state.segments.map((s) => (s.segmentId === segmentId ? transform(s) : s)) };
    onProgress(state);
    renderList();
  }

  function handleFinalize() {
    try {
      state = finalizeCleanJson(state);
      onProgress(state);
      onFinalize(state);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo finalizar la revisión.');
      renderFinalizeBar();
    }
  }

  /**
   * Mueve el foco al siguiente (`direction: 1`) o anterior (`direction: -1`)
   * segmento pendiente dentro de la lista filtrada actual, empezando la
   * búsqueda a partir de `fromSegmentId` (con vuelta al otro extremo si no
   * encuentra ninguno en esa dirección). No hace nada si no queda ningún
   * segmento pendiente visible (mejora 2026-07: acelera la revisión en
   * lotes largos, evita reubicar manualmente el siguiente segmento).
   */
  function focusAdjacentPending(fromSegmentId, direction) {
    const filtered = filterSegments(state.segments, filters, state.speakers);
    const count = filtered.length;
    if (count === 0) return;

    const fromIndex = filtered.findIndex((s) => s.segmentId === fromSegmentId);
    const start = fromIndex === -1 ? 0 : fromIndex;

    // Recorre circularmente (con vuelta al extremo opuesto) a partir del
    // segmento actual, sin repetirlo, hasta encontrar uno pendiente.
    for (let step = 1; step <= count; step += 1) {
      const index = ((start + direction * step) % count + count) % count;
      if (!isReviewed(filtered[index])) {
        focusSegment(filtered[index].segmentId);
        return;
      }
    }
  }

  function focusSegment(segmentId) {
    activeSegmentId = segmentId;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(segmentId) : segmentId;
    const target = listContainer.querySelector(`[data-segment-id="${escaped}"]`);
    target?.focus();
  }

  function handleGlobalKeydown(event) {
    if (!container.isConnected) {
      document.removeEventListener('keydown', handleGlobalKeydown);
      return;
    }
    if (event.altKey && event.key.toLowerCase() === 'a' && activeSegmentId) {
      event.preventDefault();
      handleAccept(activeSegmentId);
    } else if (event.altKey && event.key.toLowerCase() === 'e' && activeSegmentId) {
      event.preventDefault();
      startEditing(activeSegmentId);
    } else if (event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      handleFinalize();
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      focusAdjacentPending(activeSegmentId, 1);
    } else if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      focusAdjacentPending(activeSegmentId, -1);
    }
  }

  return {
    // Expuesto para permitir limpieza explícita en pruebas/orquestador (evita
    // listeners globales acumulados al cambiar de pantalla, R6 defensivo).
    destroy() {
      document.removeEventListener('keydown', handleGlobalKeydown);
    },
  };
}

