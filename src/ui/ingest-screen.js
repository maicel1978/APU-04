/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Pantalla de ingestión (carga de uno o varios archivos). Extraída de
 * app.js por límite de tamaño de archivo (R10): única responsabilidad,
 * construir el formulario de carga y delegar el parseo al llamador.
 */

import { buildButton } from './dom-helpers.js';

/**
 * Construye la tarjeta de ingestión de archivos.
 *
 * @param {{ onFilesSelected: (parsed: {fileName:string, speakersJson:object}[]) => void,
 *           onError: (message: string) => void, onOpenGlossary: () => void }} handlers
 * @returns {HTMLDivElement}
 */
export function buildIngestCard(handlers) {
  const card = document.createElement('div');
  card.className = 'card';

  const heading = document.createElement('h2');
  heading.textContent = 'Empezar';
  card.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'Elija uno o varios archivos de la etapa anterior. Se procesan en este equipo; nunca se envían a internet.';
  card.appendChild(hint);

  const dropzone = document.createElement('div');
  dropzone.className = 'dropzone';

  const icon = document.createElement('div');
  icon.className = 'dropzone-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '↑';
  dropzone.appendChild(icon);

  const title = document.createElement('p');
  title.className = 'dropzone-title';
  title.textContent = 'Haga clic para elegir uno o varios archivos';
  dropzone.appendChild(title);

  const dzHint = document.createElement('p');
  dzHint.className = 'dropzone-hint';
  dzHint.textContent = 'Archivos de hablantes en formato JSON.';
  dropzone.appendChild(dzHint);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.multiple = true;
  fileInput.className = 'dropzone-input';
  fileInput.setAttribute('aria-label', 'Seleccionar uno o varios archivos');
  dropzone.appendChild(fileInput);

  card.appendChild(dropzone);

  fileInput.addEventListener('change', async (event) => {
    handlers.onError('');
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;

    try {
      const parsed = await Promise.all(
        selected.map(async (file) => ({ fileName: file.name, speakersJson: JSON.parse(await file.text()) })),
      );
      handlers.onFilesSelected(parsed);
    } catch (error) {
      handlers.onError('No se pudo leer alguno de los archivos seleccionados. Verifique que sean archivos válidos.');
    }
  });

  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions-row';
  actionsRow.appendChild(buildButton('Diccionario de correcciones', handlers.onOpenGlossary, { variant: 'ghost' }));
  card.appendChild(actionsRow);

  return card;
}
