/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Pantalla final por archivo: descarga de `[base]_cleaned.json` (sin traza,
 * ver export-package.js), `[base]_cleaned.csv`, `[base]_trazabilidad.json`,
 * `[base]_quality_report.json`, `[base]_edit_log.csv`, y opcionalmente
 * `pii-buffer.local.json` (solo si el modo confidencial estuvo activo,
 * Regla 3). Lenguaje simple (docs/DECISIONS.md): cada archivo trae una
 * frase de para qué sirve, y el principal queda destacado.
 */

import { buildCleanTxt, buildCleanCsv, buildQualityReport, buildEditLogCsv } from '../core/derived-views.js';
import { buildCleanedPackage, buildTraceabilityPackage } from '../core/export-package.js';
import { downloadJsonFile, downloadCsvFile, downloadTextFile, buildFileName } from '../utils/download.js';

/**
 * Renderiza la pantalla de exportación de UN archivo del lote.
 *
 * @param {HTMLElement} container
 * @param {string} base - nombre base saneado (ver batch-controller.js#buildFileBase).
 * @param {object} cleanJson - debe tener auditLog.finalizedByHuman === true.
 * @param {object|null} piiBuffer - null si nerOptInActive fue false (Regla 3).
 */
export function renderExportScreen(container, base, cleanJson, piiBuffer) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la pantalla de exportación.');
  }

  container.innerHTML = '';

  const headerCard = document.createElement('div');
  headerCard.className = 'card';
  container.appendChild(headerCard);

  const heading = document.createElement('h2');
  heading.textContent = `Descargar resultados: ${base}`;
  headerCard.appendChild(heading);

  if (!cleanJson.auditLog?.finalizedByHuman) {
    const warning = document.createElement('p');
    warning.className = 'alert';
    warning.setAttribute('role', 'alert');
    warning.textContent = 'Esta entrevista todavía no fue finalizada por un humano. Complete la revisión antes de exportar.';
    headerCard.appendChild(warning);
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'La revisión quedó terminada y el texto está protegido contra cambios. Ya puede descargar los archivos.';
  headerCard.appendChild(hint);

  const report = buildQualityReport(cleanJson);
  headerCard.appendChild(buildReportSummary(report));

  const packageCard = document.createElement('div');
  packageCard.className = 'card';
  container.appendChild(packageCard);

  const packageHeading = document.createElement('h2');
  packageHeading.textContent = 'Archivos para el análisis';
  packageCard.appendChild(packageHeading);

  const packageHint = document.createElement('p');
  packageHint.className = 'section-hint';
  packageHint.textContent = 'Guarde estos archivos. El primero es el más importante; los demás son apoyo para revisar o auditar el trabajo.';
  packageCard.appendChild(packageHint);

  const grid = document.createElement('div');
  grid.className = 'download-grid';
  packageCard.appendChild(grid);

  grid.appendChild(
    buildDownloadCard(
      'Archivo principal (úselo para el análisis)',
      'Solo el texto ya revisado y los datos del estudio, sin registros internos. Listo para el siguiente paso.',
      buildFileName(base, 'cleaned', 'json'),
      () => downloadJsonFile(buildFileName(base, 'cleaned', 'json'), buildCleanedPackage(cleanJson)),
      { highlight: true },
    ),
  );
  grid.appendChild(
    buildDownloadCard(
      'Tabla del texto',
      'El mismo contenido en formato de hoja de cálculo (Excel u otro programa similar).',
      buildFileName(base, 'cleaned', 'csv'),
      () => downloadCsvFile(buildFileName(base, 'cleaned', 'csv'), buildCleanCsv(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard(
      'Resumen de calidad',
      'Las cifras de este resumen, en un archivo aparte, útiles para el apéndice metodológico.',
      buildFileName(base, 'quality_report', 'json'),
      () => downloadJsonFile(buildFileName(base, 'quality_report', 'json'), report),
    ),
  );
  grid.appendChild(
    buildDownloadCard(
      'Registro de cambios',
      'Detalle de cada corrección realizada, para poder auditar el trabajo si hace falta.',
      buildFileName(base, 'edit_log', 'csv'),
      () => downloadCsvFile(buildFileName(base, 'edit_log', 'csv'), buildEditLogCsv(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard(
      'Trazabilidad',
      'Texto original, cambios aplicados y registros de calidad de cada segmento, enlazados por identificador. Para auditar, no para el análisis.',
      buildFileName(base, 'trazabilidad', 'json'),
      () => downloadJsonFile(buildFileName(base, 'trazabilidad', 'json'), buildTraceabilityPackage(cleanJson)),
    ),
  );

  const extraCard = document.createElement('div');
  extraCard.className = 'card';
  container.appendChild(extraCard);
  const extraHeading = document.createElement('h2');
  extraHeading.textContent = 'Otro formato (opcional)';
  extraCard.appendChild(extraHeading);
  const extraGrid = document.createElement('div');
  extraGrid.className = 'download-grid';
  extraCard.appendChild(extraGrid);
  extraGrid.appendChild(
    buildDownloadCard(
      'Texto plano',
      'Solo el texto, sin datos adicionales, para leer o copiar fácilmente.',
      buildFileName(base, 'cleaned', 'txt'),
      () => downloadTextFile(buildFileName(base, 'cleaned', 'txt'), buildCleanTxt(cleanJson)),
    ),
  );

  if (piiBuffer) {
    container.appendChild(buildPiiBufferSection(base, piiBuffer));
  }
}

function buildReportSummary(report) {
  const grid = document.createElement('dl');
  grid.className = 'summary-grid';
  appendStat(grid, 'Segmentos', String(report.totalSegments));
  appendStat(grid, 'Palabras', String(report.totalWords));
  appendStat(grid, 'Ritmo de habla promedio', String(report.wpmAverage));
  appendStat(grid, 'Revisado por una persona', `${report.editedByHumanPercentage}%`);
  appendStat(grid, 'Marcado para revisión', `${report.anomalousPercentage}%`);
  appendStat(grid, 'Pausas largas', String(report.longPauseCount));
  appendStat(grid, 'Texto ordenado automáticamente', String(report.substitutionCounts.punctuation));
  appendStat(grid, 'Términos corregidos', String(report.substitutionCounts.glossary));
  appendStat(grid, 'Datos ocultados', String(report.substitutionCounts.ner));
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

function buildDownloadCard(title, description, filename, onClick, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.highlight ? 'download-card is-highlight' : 'download-card';
  button.addEventListener('click', onClick);

  const titleEl = document.createElement('span');
  titleEl.className = 'download-title';
  titleEl.textContent = title;
  button.appendChild(titleEl);

  const descriptionEl = document.createElement('span');
  descriptionEl.className = 'download-description';
  descriptionEl.textContent = description;
  button.appendChild(descriptionEl);

  const filenameEl = document.createElement('span');
  filenameEl.className = 'download-filename';
  filenameEl.textContent = filename;
  button.appendChild(filenameEl);

  return button;
}

function buildPiiBufferSection(base, piiBuffer) {
  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = 'Datos ocultados (uso interno)';
  card.appendChild(heading);

  const warning = document.createElement('p');
  warning.className = 'alert';
  warning.setAttribute('role', 'alert');
  warning.textContent =
    piiBuffer.warning ?? 'Contiene datos identificables reales. No comparta este archivo ni lo suba a internet. No forma parte de los archivos para el análisis.';
  card.appendChild(warning);

  const filename = buildFileName(base, 'pii-buffer.local', 'json');
  const button = buildDownloadCard(
    'Registro de datos ocultados',
    'Solo para uso interno del equipo del estudio, por si necesita recuperar un dato oculto más adelante.',
    filename,
    () => downloadJsonFile(filename, piiBuffer),
  );
  button.classList.add('is-danger');
  card.appendChild(button);

  return card;
}
