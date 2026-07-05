/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Panel de calidad (Regla 2 del encargo): muestra métricas por archivo y por
 * lote (conteo de palabras, ritmo de habla, pausas largas, términos que
 * conviene revisar), permitiendo auditar por excepción en vez de leer todo
 * el lote linealmente. Consume src/core/batch-controller.js (agregación
 * pura) y solo añade el renderizado DOM. Lenguaje simple (mejora 2026-07):
 * sin nombres de módulo del ecosistema en pantalla, ver docs/DECISIONS.md.
 *
 * También muestra las palabras/frases más repetidas del lote (mejora
 * 2026-07, src/core/term-frequency.js): solo para AYUDAR a detectar
 * variantes de un mismo concepto y decidir si conviene declarar una regla en
 * el Diccionario de correcciones; no es un análisis del corpus.
 */

import { buildBadge, buildButton } from './dom-helpers.js';
import { computeTermFrequency } from '../core/term-frequency.js';
import { collectCovariateBreakdown, mergeCovariateBreakdowns } from '../core/covariate-summary.js';

/**
 * Renderiza el Panel de calidad dentro de `container`.
 *
 * @param {HTMLElement} container
 * @param {ReturnType<import('../core/batch-controller.js').buildBatchDashboard>} dashboard
 * @param {{ segments: object[], speakers: object[] }[]} filesData - por cada archivo del
 *   lote, sus segmentos y hablantes (para la lista de términos frecuentes y el
 *   resumen por grupo/covariable).
 * @param {(base: string) => void} onOpenFile - abre la revisión del archivo elegido.
 * @param {() => void} onContinue - continúa hacia la revisión (habilitado siempre;
 *   la gestión por excepción es informativa, no bloqueante).
 * @param {() => void} onOpenGlossary - abre el Diccionario de correcciones.
 */
export function renderDashboardView(container, dashboard, filesData, onOpenFile, onContinue, onOpenGlossary) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para el panel de calidad.');
  }

  container.innerHTML = '';
  const files = Array.isArray(filesData) ? filesData : [];

  const headerCard = document.createElement('div');
  headerCard.className = 'card';
  container.appendChild(headerCard);

  const heading = document.createElement('h2');
  heading.textContent = 'Panel de calidad';
  headerCard.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent =
    dashboard.totalFiles > 1
      ? `${dashboard.totalFiles} archivos cargados. Revise primero los que necesitan atención.`
      : 'Resumen antes de revisar el texto.';
  headerCard.appendChild(hint);

  headerCard.appendChild(buildTotalsGrid(dashboard));

  const filesCard = document.createElement('div');
  filesCard.className = 'card';
  container.appendChild(filesCard);

  const filesHeading = document.createElement('h2');
  filesHeading.textContent = 'Archivos';
  filesCard.appendChild(filesHeading);

  filesCard.appendChild(buildFileTable(dashboard.perFile, onOpenFile));

  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions-row';
  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'btn btn-primary';
  continueButton.textContent = 'Empezar a revisar';
  continueButton.addEventListener('click', onContinue);
  actionsRow.appendChild(continueButton);
  actionsRow.appendChild(buildButton('Diccionario de correcciones', onOpenGlossary, { variant: 'ghost' }));
  filesCard.appendChild(actionsRow);

  const groupsCard = buildGroupsCard(files);
  if (groupsCard) container.appendChild(groupsCard);

  const allSegments = files.flatMap((f) => f.segments ?? []);
  const frequentTermsCard = buildFrequentTermsCard(allSegments);
  if (frequentTermsCard) container.appendChild(frequentTermsCard);
}

function buildTotalsGrid(dashboard) {
  const grid = document.createElement('dl');
  grid.className = 'summary-grid';
  appendStat(grid, 'Archivos', String(dashboard.totalFiles));
  appendStat(grid, 'Segmentos', String(dashboard.totalSegments));
  appendStat(grid, 'Palabras', String(dashboard.totalWords));
  appendStat(grid, 'Ritmo de habla promedio', String(dashboard.wpmAverage));
  appendStat(grid, 'Marcado para revisión', `${dashboard.anomalousPercentage}%`);
  appendStat(grid, 'Pausas largas', String(dashboard.longPauseCount));
  appendStat(grid, 'Términos para revisar', String(dashboard.suspiciousTermsCount));
  return grid;
}

function appendStat(dl, term, value) {
  const stat = document.createElement('div');
  stat.className = 'summary-stat';
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  stat.appendChild(dt);
  stat.appendChild(dd);
  dl.appendChild(stat);
}

function buildFileTable(perFile, onOpenFile) {
  const list = document.createElement('ul');
  list.className = 'file-list';
  list.setAttribute('aria-label', 'Archivos, ordenados por prioridad de revisión');

  // Gestión por excepción (Regla 2): los archivos que necesitan revisión van primero.
  const sorted = [...perFile].sort((a, b) => Number(b.needsReview) - Number(a.needsReview));

  for (const file of sorted) {
    list.appendChild(buildFileRow(file, onOpenFile));
  }
  return list;
}

function buildFileRow(file, onOpenFile) {
  const item = document.createElement('li');
  item.className = 'file-row';
  item.dataset.base = file.base;
  item.dataset.needsReview = String(file.needsReview);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-row-button';
  button.addEventListener('click', () => onOpenFile(file.base));

  const nameEl = document.createElement('span');
  nameEl.className = 'file-row-name';
  nameEl.textContent = file.fileName;
  button.appendChild(nameEl);

  const statsEl = document.createElement('span');
  statsEl.className = 'file-row-stats';
  statsEl.textContent = `${file.totalSegments} segmentos · ${file.anomalousPercentage}% para revisar · ${file.suspiciousTermsCount} términos · ${file.longPauseCount} pausas largas`;
  button.appendChild(statsEl);

  button.appendChild(file.needsReview ? buildBadge('Revisar', 'danger') : buildBadge('Listo', 'success'));

  item.appendChild(button);
  return item;
}

/**
 * Muestra, por cada covariable presente (p. ej. "grupo_estudio"), cuántos
 * segmentos hay de cada valor en todo el lote. Solo cuenta y agrupa
 * (determinista); no compara grupos entre sí ni calcula significancia
 * — eso es responsabilidad de APU-05C (ver docs/DECISIONS.md).
 */
function buildGroupsCard(files) {
  const breakdown = mergeCovariateBreakdowns(
    files.map((f) => collectCovariateBreakdown(f.segments ?? [], f.speakers ?? [])),
  );
  const keys = Object.keys(breakdown);
  if (keys.length === 0) return null;

  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = 'Grupos y variables del estudio';
  card.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'Cuántos segmentos hay de cada grupo o variable, según los datos que trajo el archivo.';
  card.appendChild(hint);

  for (const key of keys) {
    const groupHeading = document.createElement('h3');
    groupHeading.textContent = key;
    card.appendChild(groupHeading);

    const grid = document.createElement('dl');
    grid.className = 'summary-grid';
    for (const [value, count] of Object.entries(breakdown[key])) {
      appendStat(grid, value, String(count));
    }
    card.appendChild(grid);
  }

  return card;
}

function buildFrequentTermsCard(allSegments) {
  if (!Array.isArray(allSegments) || allSegments.length === 0) return null;
  const { words, bigrams } = computeTermFrequency(allSegments);
  if (words.length === 0 && bigrams.length === 0) return null;

  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = 'Palabras y frases más repetidas';
  card.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent =
    'Esto es solo para ayudarle a notar si distintas personas nombran lo mismo de formas diferentes. Si quiere unificarlas, agregue una regla en el Diccionario de correcciones.';
  card.appendChild(hint);

  const cloud = document.createElement('div');
  cloud.className = 'term-cloud';
  cloud.setAttribute('aria-label', 'Palabras y frases más repetidas del texto cargado');

  const allTerms = [...words, ...bigrams].sort((a, b) => b.count - a.count).slice(0, 20);
  const maxCount = Math.max(...allTerms.map((t) => t.count), 1);

  for (const term of allTerms) {
    const tag = document.createElement('span');
    tag.className = 'term-tag';
    tag.textContent = `${term.term} (${term.count})`;
    tag.style.fontSize = `${0.75 + (term.count / maxCount) * 0.65}rem`;
    cloud.appendChild(tag);
  }
  card.appendChild(cloud);

  return card;
}
