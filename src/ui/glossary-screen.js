/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Pantalla de glosario editable (mejora 2026-07, pedida por el usuario):
 * ver/agregar/editar/quitar términos que el investigador quiere corregir de
 * forma automática y trazable (ver src/core/glossary-engine.js). Los cambios
 * se guardan localmente (src/core/glossary-store.js) y se pueden exportar/
 * importar como archivo para reutilizar entre sesiones o compartir con el
 * equipo del estudio. Lenguaje simple, sin nombres de módulo del ecosistema.
 */

import { downloadJsonFile } from '../utils/download.js';
import { buildButton } from './dom-helpers.js';

/**
 * Renderiza la pantalla de glosario dentro de `container`.
 *
 * @param {HTMLElement} container
 * @param {{ wrong: string, correct: string, exact?: boolean }[]} entries - entradas actuales (base + guardadas).
 * @param {(entries: object[]) => void} onSave - se llama con la lista completa cada vez que cambia.
 * @param {() => void} onBack
 */
export function renderGlossaryScreen(container, entries, onSave, onBack) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la pantalla de diccionario de correcciones.');
  }

  let state = Array.isArray(entries) ? [...entries] : [];

  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  const heading = document.createElement('h2');
  heading.textContent = 'Diccionario de correcciones';
  card.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent =
    'Palabras o frases que quiere que la aplicación corrija siempre igual. Por ejemplo, si en su estudio la gente dice "IAM" y usted prefiere que quede escrito "infarto agudo de miocardio", agréguelo aquí una sola vez.';
  card.appendChild(hint);

  const tableWrapper = document.createElement('div');
  card.appendChild(tableWrapper);

  const addForm = buildAddForm((entry) => {
    state = [...state, entry];
    onSave(state);
    renderTable();
  });
  card.appendChild(addForm);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions-row';
  actionsRow.appendChild(buildExportButton());
  actionsRow.appendChild(buildImportButton());
  actionsRow.appendChild(buildButton('Volver', onBack, { variant: 'ghost' }));
  card.appendChild(actionsRow);

  renderTable();

  function renderTable() {
    tableWrapper.innerHTML = '';
    if (state.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Todavía no hay términos guardados.';
      tableWrapper.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'glossary-list';
    list.setAttribute('aria-label', 'Términos del diccionario de correcciones');

    state.forEach((entry, index) => {
      list.appendChild(buildRow(entry, index));
    });
    tableWrapper.appendChild(list);
  }

  function buildRow(entry, index) {
    const item = document.createElement('li');
    item.className = 'glossary-row';

    const wrongEl = document.createElement('span');
    wrongEl.className = 'glossary-wrong';
    wrongEl.textContent = entry.wrong;
    item.appendChild(wrongEl);

    const arrowEl = document.createElement('span');
    arrowEl.className = 'muted';
    arrowEl.textContent = '→';
    arrowEl.setAttribute('aria-hidden', 'true');
    item.appendChild(arrowEl);

    const correctEl = document.createElement('span');
    correctEl.className = 'glossary-correct';
    correctEl.textContent = entry.correct;
    item.appendChild(correctEl);

    const removeButton = buildButton('Quitar', () => {
      state = state.filter((_, i) => i !== index);
      onSave(state);
      renderTable();
    }, { variant: 'ghost' });
    removeButton.setAttribute('aria-label', `Quitar la corrección de "${entry.wrong}"`);
    item.appendChild(removeButton);

    return item;
  }

  function buildExportButton() {
    return buildButton('Guardar diccionario en un archivo', () => {
      downloadJsonFile('diccionario-de-correcciones.json', {
        schemaVersion: '5.0.0',
        ecosystem: 'APU',
        unit: 'APU-04',
        stage: 'glossary',
        entries: state,
      });
    }, { variant: 'secondary' });
  }

  function buildImportButton() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    fileInput.className = 'is-hidden';
    fileInput.setAttribute('aria-label', 'Cargar un diccionario de correcciones guardado antes');

    const button = buildButton('Cargar diccionario desde un archivo', () => fileInput.click(), { variant: 'secondary' });
    button.appendChild(fileInput);

    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const imported = Array.isArray(parsed.entries) ? parsed.entries : [];
        state = mergeImported(state, imported);
        onSave(state);
        renderTable();
      } catch (error) {
        window.alert('No se pudo leer el archivo. Verifique que sea un diccionario de correcciones válido.');
      }
    });

    return button;
  }
}

function mergeImported(current, imported) {
  const byWrong = new Map(current.map((e) => [normalizeKey(e.wrong), e]));
  for (const entry of imported) {
    if (typeof entry.wrong === 'string' && typeof entry.correct === 'string') {
      byWrong.set(normalizeKey(entry.wrong), entry);
    }
  }
  return [...byWrong.values()];
}

function normalizeKey(wrong) {
  return typeof wrong === 'string' ? wrong.trim().toLocaleLowerCase('es') : '';
}

function buildAddForm(onAdd) {
  const form = document.createElement('form');
  form.className = 'field-grid';
  form.setAttribute('aria-label', 'Agregar un nuevo término al diccionario de correcciones');

  const wrongField = buildTextField('glossary-wrong', 'Como aparece en el texto');
  const correctField = buildTextField('glossary-correct', 'Como debe quedar corregido');
  form.appendChild(wrongField.wrapper);
  form.appendChild(correctField.wrapper);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'btn btn-primary';
  submitButton.textContent = 'Agregar';
  form.appendChild(submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const wrong = wrongField.input.value.trim();
    const correct = correctField.input.value.trim();
    if (wrong === '' || correct === '') return;
    onAdd({ wrong, correct, exact: true });
    wrongField.input.value = '';
    correctField.input.value = '';
    wrongField.input.focus();
  });

  return form;
}

function buildTextField(id, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.setAttribute('for', id);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return { wrapper, input };
}
