/**
 * Descarga de archivos en el navegador (Blob + enlace temporal, sin
 * librerías externas, sin red). Nombres de archivo según la convención
 * `[study]_[case]_[stage].[ext]` (docs/CONTRACTS.md §9).
 */

/**
 * Dispara la descarga de un archivo de texto (JSON o CSV ya serializados)
 * en el navegador, sin depender de ninguna librería externa: crea un `Blob`
 * local, un `<a download>` temporal y lo libera inmediatamente después.
 *
 * @param {string} filename - nombre de archivo, ver docs/CONTRACTS.md §3.
 * @param {string} content - contenido ya serializado (texto JSON o CSV).
 * @param {string} [mimeType] - tipo MIME, por defecto texto plano.
 */
export function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new Error('No se pudo generar el archivo de descarga: falta un nombre de archivo válido.');
  }
  if (typeof content !== 'string') {
    throw new Error('No se pudo generar el archivo de descarga: el contenido no es texto válido.');
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Libera el Object URL de inmediato: los archivos que exporta APU-04 son
    // texto (JSON/CSV de una entrevista, nunca binarios grandes), y revocar
    // justo después de `click()` es seguro en Chrome/Firefox/Safari para este
    // tamaño de archivo (a diferencia de descargas binarias de cientos de MB,
    // donde algunos navegadores sí necesitan un margen). Evita además dejar
    // temporizadores pendientes que compliquen las pruebas y el cierre limpio
    // de la aplicación (sin recursos colgados).
    URL.revokeObjectURL(url);
  }
}

/**
 * Descarga un objeto como JSON indentado (2 espacios, formato legible), útil
 * tanto para `[base]_clean.json` como para `[base]_pii-buffer.local.json` y
 * las vistas derivadas en formato JSON (`quality-report.json`, etc.).
 *
 * @param {string} filename
 * @param {object} data
 */
export function downloadJsonFile(filename, data) {
  downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

/**
 * Descarga contenido CSV ya serializado (ver src/core/derived-views.js).
 * @param {string} filename
 * @param {string} csvContent
 */
export function downloadCsvFile(filename, csvContent) {
  downloadTextFile(filename, csvContent, 'text/csv;charset=utf-8');
}

/**
 * Construye el nombre de archivo canónico `[study]_[case]_[stage].[ext]`
 * (docs/CONTRACTS.md §3), saneando `studyId`/`caseId` para evitar
 * caracteres inválidos en nombres de archivo (espacios y símbolos no
 * alfanuméricos se convierten a guion).
 *
 * @param {string|null} studyId
 * @param {string|null} caseId
 * @param {string} stage - p.ej. "clean", "pii-buffer.local", "quality-report".
 * @param {string} ext - p.ej. "json", "csv", "txt".
 * @returns {string}
 */
export function buildFileName(studyId, caseId, stage, ext) {
  const safeStudy = sanitizeSegment(studyId, 'estudio');
  const safeCase = sanitizeSegment(caseId, 'caso');
  return `${safeStudy}_${safeCase}_${stage}.${ext}`;
}

function sanitizeSegment(value, fallback) {
  const raw = typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
  return raw.toLocaleLowerCase('es').replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
