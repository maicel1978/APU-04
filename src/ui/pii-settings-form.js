/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Formulario de configuración de privacidad (Regla 3 del encargo): el
 * enmascarado de PII (NER por reglas y listas, nunca IA estadística) está
 * APAGADO por defecto. Si el investigador activa el "modo confidencial",
 * puede declarar listas manuales de nombres, hospitales/sitios y
 * direcciones (nunca se infieren del texto). Reemplaza a pii-list-form.js
 * de v1 (que era opcional pero sin un toggle explícito de encendido/apagado).
 */

import { parseFreeTextList } from '../utils/text-list.js';

/**
 * Renderiza el formulario de privacidad dentro de `container`. Llama a
 * `onSubmit` con `{ nerOptInActive, manualNames, manualHospitals, manualAddresses }`
 * cuando el usuario confirma (botón "Continuar"). El toggle inicia en OFF
 * (Regla 3: apagado por defecto); las listas manuales solo son relevantes
 * si el toggle está activo, pero se conservan aunque se desactive
 * temporalmente, por si el usuario cambia de opinión antes de continuar.
 *
 * @param {HTMLElement} container
 * @param {(result: { nerOptInActive: boolean, manualNames: string[], manualHospitals: string[], manualAddresses: string[] }) => void} onSubmit
 */
export function renderPiiSettingsForm(container, onSubmit) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para el formulario de privacidad.');
  }

  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Privacidad y datos sensibles';
  container.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent =
    'No todas las entrevistas requieren ocultar nombres. El enmascarado está apagado de forma predeterminada.';
  container.appendChild(hint);

  const form = document.createElement('form');
  form.setAttribute('aria-label', 'Configuración de privacidad y enmascarado de datos sensibles');

  const toggleField = document.createElement('div');
  toggleField.className = 'field';
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-label';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.id = 'apu04-ner-opt-in';
  toggleInput.checked = false; // Regla 3: apagado por defecto, sin excepciones.
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(document.createTextNode(' Activar modo confidencial (enmascarar datos sensibles)'));
  toggleField.appendChild(toggleLabel);
  form.appendChild(toggleField);

  const disclosure = document.createElement('p');
  disclosure.className = 'note';
  disclosure.setAttribute('role', 'note');
  disclosure.textContent =
    'El enmascarado se basa en reglas y listas explícitas, no en inteligencia artificial estadística. ' +
    'Cada mención de una misma persona u hospital recibe siempre el mismo identificador ' +
    '([PERSONA_1], [HOSPITAL_A]...) en todo el documento. El mapa de des-enmascaramiento se ' +
    'guarda únicamente en un archivo local separado (pii-buffer.local.json), nunca en el paquete exportable.';
  form.appendChild(disclosure);

  const listsWrapper = document.createElement('div');
  listsWrapper.className = 'field-grid';
  listsWrapper.hidden = true; // Solo relevante si el toggle está activo.
  form.appendChild(listsWrapper);

  const namesField = buildTextareaField('apu04-pii-names', 'Nombres a enmascarar', 'Uno por línea.');
  const hospitalsField = buildTextareaField('apu04-pii-hospitals', 'Hospitales/sitios a enmascarar', 'Uno por línea.');
  const addressesField = buildTextareaField('apu04-pii-addresses', 'Direcciones a enmascarar', 'Una por línea.');
  listsWrapper.appendChild(namesField.wrapper);
  listsWrapper.appendChild(hospitalsField.wrapper);
  listsWrapper.appendChild(addressesField.wrapper);

  toggleInput.addEventListener('change', () => {
    listsWrapper.hidden = !toggleInput.checked;
  });

  const actionsRow = document.createElement('div');
  actionsRow.className = 'actions-row';
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'btn btn-primary';
  submitButton.textContent = 'Continuar';
  actionsRow.appendChild(submitButton);
  form.appendChild(actionsRow);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({
      nerOptInActive: toggleInput.checked,
      manualNames: parseFreeTextList(namesField.textarea.value),
      manualHospitals: parseFreeTextList(hospitalsField.textarea.value),
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
