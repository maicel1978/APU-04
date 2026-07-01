/**
 * Formulario de listas manuales de nombres/direcciones a enmascarar
 * (docs/CONTRACTS.md §7): nunca se infieren del texto, el usuario las
 * declara. Incluye la advertencia obligatoria de que el enmascarado es por
 * reglas y listas, no IA estadística, y puede tener falsos negativos.
 * Probado con jsdom en tests/apu04-pii-list-form.dom.test.mjs.
 */

import { parseFreeTextList } from '../utils/text-list.js';

/**
 * Renderiza el formulario de listas manuales de PII (nombres y direcciones a
 * enmascarar) dentro de `container`. Llama a `onSubmit` con
 * `{ manualNames: string[], manualAddresses: string[] }` cada vez que el
 * usuario confirma la lista (botón "Aplicar"), permitiendo actualizarla varias
 * veces durante la sesión antes de ejecutar el pipeline de limpieza.
 *
 * @param {HTMLElement} container
 * @param {(result: { manualNames: string[], manualAddresses: string[] }) => void} onSubmit
 */
export function renderPiiListForm(container, onSubmit) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para mostrar el formulario de listas de PII.');
  }

  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Nombres y direcciones a enmascarar';
  container.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'Opcional. Ayuda a detectar menciones de PII que las reglas automáticas podrían pasar por alto.';
  container.appendChild(hint);

  const disclosure = document.createElement('p');
  disclosure.className = 'note';
  disclosure.setAttribute('role', 'note');
  disclosure.textContent =
    'Este enmascarado se basa en reglas y listas, no en inteligencia artificial estadística. ' +
    'Puede no detectar todas las menciones. Revise manualmente cada segmento marcado y los no ' +
    'marcados antes de continuar.';
  container.appendChild(disclosure);

  const form = document.createElement('form');
  form.setAttribute('aria-label', 'Listas manuales de nombres y direcciones a enmascarar');

  const namesField = buildTextareaField(
    'apu04-pii-names',
    'Nombres a enmascarar',
    'Uno por línea, por ejemplo del listado de consentimiento informado.',
  );
  form.appendChild(namesField.wrapper);

  const addressesField = buildTextareaField(
    'apu04-pii-addresses',
    'Direcciones a enmascarar',
    'Una por línea.',
  );
  form.appendChild(addressesField.wrapper);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions-row';
  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.className = 'btn btn-primary';
  applyButton.textContent = 'Aplicar y continuar';
  actionsRow.appendChild(applyButton);
  form.appendChild(actionsRow);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({
      manualNames: parseFreeTextList(namesField.textarea.value),
      manualAddresses: parseFreeTextList(addressesField.textarea.value),
    });
  });

  container.appendChild(form);
}

function buildTextareaField(id, label, help) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.setAttribute('for', id);
  const textarea = document.createElement('textarea');
  textarea.id = id;
  textarea.rows = 3;
  wrapper.appendChild(labelEl);
  wrapper.appendChild(textarea);
  if (help) {
    const helpEl = document.createElement('p');
    helpEl.className = 'field-help';
    helpEl.textContent = help;
    wrapper.appendChild(helpEl);
  }
  return { wrapper, textarea };
}
