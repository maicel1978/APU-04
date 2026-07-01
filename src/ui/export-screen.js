/**
 * Pantalla final: resumen de calidad (tarjetas de estadística) y botones de
 * descarga para clean.json y cada vista derivada (docs/CONTRACTS.md §4/§6).
 * Los textos de botones incluyen el nombre de archivo real como subcadena
 * (p. ej. contienen literalmente "clean.json"), verificado por
 * tests/apu04-export-screen.dom.test.mjs — no quitar esa subcadena al editar.
 *
 * Regla dura: `pii-buffer.local.json` se descarga por separado, con
 * advertencia explícita, y NUNCA se incluye junto al resto del paquete de
 * exportación (docs/CONTRACTS.md §5).
 */

import {
  buildCleanTxt,
  buildCleanCsv,
  buildQualityReport,
  buildGlossaryHits,
  buildFlaggedSegments,
  buildEditLogCsv,
} from '../core/derived-views.js';
import { downloadJsonFile, downloadCsvFile, downloadTextFile, buildFileName } from '../utils/download.js';

const DERIVED_VIEWS_LABEL = 'Vistas derivadas';

/**
 * Renderiza la pantalla final de exportación: resumen de calidad en pantalla
 * (docs/DECISIONS.md §2.4) y botones de descarga para
 * `clean.json`, todas las vistas derivadas, y — por separado, con advertencia —
 * `pii-buffer.local.json`.
 *
 * @param {HTMLElement} container
 * @param {object} cleanJson - debe tener auditLog.finalizedByHuman === true.
 * @param {object} piiBuffer
 */
export function renderExportScreen(container, cleanJson, piiBuffer) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la pantalla de exportación.');
  }

  container.innerHTML = '';

  const headerCard = document.createElement('div');
  headerCard.className = 'card';
  container.appendChild(headerCard);

  const heading = document.createElement('h2');
  heading.textContent = 'Resumen y exportación';
  headerCard.appendChild(heading);

  if (!cleanJson.auditLog?.finalizedByHuman) {
    const warning = document.createElement('p');
    warning.className = 'alert';
    warning.setAttribute('role', 'alert');
    warning.textContent =
      'Esta entrevista todavía no fue finalizada por un humano. Complete la revisión antes de exportar.';
    headerCard.appendChild(warning);
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'La entrevista quedó finalizada y el texto limpio está bloqueado. Ya puede descargar los archivos.';
  headerCard.appendChild(hint);

  const report = buildQualityReport(cleanJson);
  headerCard.appendChild(buildReportSummary(report));

  const studyId = cleanJson.studyId;
  const caseId = cleanJson.covariates?.caseId ?? null;

  headerCard.appendChild(
    buildPrimaryDownload(
      'Descargar transcripción completa',
      buildFileName(studyId, caseId, 'clean', 'json'),
      () => downloadJsonFile(buildFileName(studyId, caseId, 'clean', 'json'), cleanJson),
    ),
  );

  const derivedCard = document.createElement('div');
  derivedCard.className = 'card';
  container.appendChild(derivedCard);

  const derivedHeading = document.createElement('h2');
  derivedHeading.textContent = DERIVED_VIEWS_LABEL;
  derivedCard.appendChild(derivedHeading);

  const derivedHint = document.createElement('p');
  derivedHint.className = 'section-hint';
  derivedHint.textContent = 'Formatos adicionales generados a partir de la transcripción, listos para análisis o revisión.';
  derivedCard.appendChild(derivedHint);

  const grid = document.createElement('div');
  grid.className = 'download-grid';
  derivedCard.appendChild(grid);

  grid.appendChild(
    buildDownloadCard('Texto plano', buildFileName(studyId, caseId, 'clean', 'txt'), () =>
      downloadTextFile(buildFileName(studyId, caseId, 'clean', 'txt'), buildCleanTxt(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard('Tabla por segmento', buildFileName(studyId, caseId, 'clean', 'csv'), () =>
      downloadCsvFile(buildFileName(studyId, caseId, 'clean', 'csv'), buildCleanCsv(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard('Reporte de calidad', buildFileName(studyId, caseId, 'quality-report', 'json'), () =>
      downloadJsonFile(buildFileName(studyId, caseId, 'quality-report', 'json'), report),
    ),
  );
  grid.appendChild(
    buildDownloadCard('Términos corregidos', buildFileName(studyId, caseId, 'glossary-hits', 'json'), () =>
      downloadJsonFile(buildFileName(studyId, caseId, 'glossary-hits', 'json'), buildGlossaryHits(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard('Segmentos problemáticos', buildFileName(studyId, caseId, 'flagged-segments', 'json'), () =>
      downloadJsonFile(buildFileName(studyId, caseId, 'flagged-segments', 'json'), buildFlaggedSegments(cleanJson)),
    ),
  );
  grid.appendChild(
    buildDownloadCard('Bitácora de edición', buildFileName(studyId, caseId, 'edit-log', 'csv'), () =>
      downloadCsvFile(buildFileName(studyId, caseId, 'edit-log', 'csv'), buildEditLogCsv(cleanJson)),
    ),
  );

  container.appendChild(buildPiiBufferSection(studyId, caseId, piiBuffer));
}

function buildReportSummary(report) {
  const grid = document.createElement('dl');
  grid.className = 'summary-grid';
  appendStat(grid, 'Segmentos', String(report.totalSegments));
  appendStat(grid, 'Editado por humano', `${report.editedByHumanPercentage}%`);
  appendStat(grid, 'Anómalo', `${report.anomalousPercentage}%`);
  appendStat(grid, 'WPM promedio', report.wpmDistribution.average.toFixed(0));
  appendStat(grid, 'Correcciones de glosario', String(report.substitutionCounts.glossary));
  appendStat(grid, 'Datos enmascarados', String(report.substitutionCounts.ner));
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

function buildPrimaryDownload(title, filename, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary btn-block download-primary';
  button.addEventListener('click', onClick);

  const titleEl = document.createElement('span');
  titleEl.className = 'download-primary-title';
  titleEl.textContent = title;
  button.appendChild(titleEl);

  const filenameEl = document.createElement('span');
  filenameEl.className = 'download-primary-filename';
  filenameEl.textContent = filename;
  button.appendChild(filenameEl);

  return button;
}

function buildDownloadCard(title, filename, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'download-card';
  button.addEventListener('click', onClick);

  const titleEl = document.createElement('span');
  titleEl.className = 'download-title';
  titleEl.textContent = title;
  button.appendChild(titleEl);

  const filenameEl = document.createElement('span');
  filenameEl.className = 'download-filename';
  filenameEl.textContent = filename;
  button.appendChild(filenameEl);

  return button;
}

function buildPiiBufferSection(studyId, caseId, piiBuffer) {
  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = 'Datos identificables (uso interno)';
  card.appendChild(heading);

  const warning = document.createElement('p');
  warning.className = 'alert';
  warning.setAttribute('role', 'alert');
  warning.textContent =
    piiBuffer.warning ??
    'Contiene datos identificables. No compartir ni subir a red. No incluir en exportaciones hacia APU-05.';
  card.appendChild(warning);

  const filename = buildFileName(studyId, caseId, 'pii-buffer.local', 'json');
  const button = buildDownloadCard('Descargar registro de datos identificables', filename, () =>
    downloadJsonFile(filename, piiBuffer),
  );
  button.classList.add('is-danger');
  card.appendChild(button);

  return card;
}
