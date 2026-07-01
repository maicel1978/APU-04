/**
 * Formulario obligatorio y editable de studyId/covariates (docs/CONTRACTS.md
 * §3): nunca se infiere automáticamente. Incluye validación cruzada NO
 * bloqueante (edad fuera de rango, campos vacíos = solo advertencia).
 * Se divide en lógica pura (normalizeFormValues, validateCovariatesForm,
 * probada en tests/apu04-covariates-form.test.mjs) y renderizado DOM
 * (renderCovariatesForm, probado con jsdom).
 */


const COVARIATE_FIELDS = [
  { key: 'caseId', label: 'Identificador de caso', type: 'text' },
  { key: 'group', label: 'Grupo', type: 'select', options: ['intervencion', 'control'] },
  { key: 'moment', label: 'Momento', type: 'select', options: ['pre', 'post'] },
  { key: 'sex', label: 'Sexo', type: 'select', options: ['M', 'F'] },
  { key: 'age', label: 'Edad', type: 'number' },
  { key: 'site', label: 'Sitio (hospital/centro)', type: 'text' },
  { key: 'diagnosis', label: 'Diagnóstico', type: 'text' },
];

/**
 * Normaliza los valores crudos del formulario (strings del DOM) al tipo
 * correcto del contrato canónico (docs/CONTRACTS.md §3): `age`
 * como número o `null`, resto de campos vacíos como `null` explícito, nunca
 * como cadena vacía ni omitidos.
 *
 * Función pura, sin acceso a DOM: recibe un objeto plano de valores.
 *
 * @param {{ studyId?: string, caseId?: string, group?: string, moment?: string,
 *           sex?: string, age?: string|number, site?: string, diagnosis?: string }} rawValues
 * @returns {{ studyId: string|null, covariates: object }}
 */
export function normalizeFormValues(rawValues) {
  const source = rawValues && typeof rawValues === 'object' ? rawValues : {};

  const covariates = {};
  for (const field of COVARIATE_FIELDS) {
    const value = source[field.key];
    if (field.key === 'age') {
      const parsed = value === '' || value === undefined || value === null ? null : Number(value);
      covariates.age = Number.isNaN(parsed) ? null : parsed;
    } else {
      covariates[field.key] = value === '' || value === undefined ? null : value;
    }
  }

  return {
    studyId: source.studyId === '' || source.studyId === undefined ? null : source.studyId,
    covariates,
  };
}

/**
 * Validación cruzada NO bloqueante de docs/DECISIONS.md §2.7:
 * genera advertencias (no errores) si `age` está fuera de rango plausible, o
 * si `moment`/`group` quedan vacíos al intentar exportar. Nunca impide el
 * guardado: el usuario puede tener razones legítimas para dejar un campo sin
 * completar.
 *
 * @param {{ studyId: string|null, covariates: object }} normalized
 * @returns {string[]} lista de advertencias en español (vacía si no hay ninguna)
 */
export function validateCovariatesForm(normalized) {
  const warnings = [];
  const covariates = normalized.covariates ?? {};

  if (covariates.age !== null && (covariates.age < 0 || covariates.age > 120)) {
    warnings.push('La edad indicada está fuera de un rango plausible (0-120 años). Verifique el dato.');
  }
  if (covariates.group === null) {
    warnings.push('El campo "Grupo" está vacío. Esto puede dificultar la comparación posterior por covariables.');
  }
  if (covariates.moment === null) {
    warnings.push('El campo "Momento" está vacío. Esto puede dificultar la comparación posterior por covariables.');
  }
  if (normalized.studyId === null) {
    warnings.push('El identificador de estudio ("studyId") está vacío.');
  }

  return warnings;
}

/**
 * Renderiza el formulario obligatorio y editable de studyId/covariates dentro
 * del contenedor dado, en español, y llama a `onSubmit` con los valores ya
 * normalizados (ver normalizeFormValues) al enviar.
 *
 * NO probado con test automatizado en este entorno (requiere DOM real, ver
 * nota de cobertura en la cabecera de este archivo).
 *
 * @param {HTMLElement} container
 * @param {(result: { studyId: string|null, covariates: object, warnings: string[] }) => void} onSubmit
 */
export function renderCovariatesForm(container, onSubmit) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para mostrar el formulario de estudio.');
  }

  container.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'Datos del estudio';
  container.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.textContent = 'Estos datos nunca se infieren automáticamente: complételos usted mismo. Puede dejar campos vacíos y continuar.';
  container.appendChild(hint);

  const form = document.createElement('form');
  form.setAttribute('aria-label', 'Formulario de datos del estudio y covariables');

  const studyIdField = buildTextField('studyId', 'Identificador de estudio', 'text');
  form.appendChild(studyIdField.wrapper);

  const grid = document.createElement('div');
  grid.className = 'field-grid two-col';
  form.appendChild(grid);

  const fieldRefs = { studyId: studyIdField.input };
  for (const field of COVARIATE_FIELDS) {
    const built =
      field.type === 'select'
        ? buildSelectField(field.key, field.label, field.options)
        : buildTextField(field.key, field.label, field.type);
    grid.appendChild(built.wrapper);
    fieldRefs[field.key] = built.input;
  }

  const warningsBox = document.createElement('p');
  warningsBox.className = 'note is-hidden';
  warningsBox.setAttribute('role', 'status');
  warningsBox.setAttribute('aria-live', 'polite');
  form.appendChild(warningsBox);

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
    const rawValues = {};
    for (const [key, input] of Object.entries(fieldRefs)) {
      rawValues[key] = input.value;
    }
    const normalized = normalizeFormValues(rawValues);
    const warnings = validateCovariatesForm(normalized);
    warningsBox.textContent = warnings.join(' ');
    warningsBox.classList.toggle('is-hidden', warnings.length === 0);
    onSubmit({ ...normalized, warnings });
  });

  container.appendChild(form);
}

function buildTextField(key, label, type) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.setAttribute('for', `apu04-${key}`);
  const input = document.createElement('input');
  input.type = type;
  input.id = `apu04-${key}`;
  input.name = key;
  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return { wrapper, input };
}

function buildSelectField(key, label, options) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.setAttribute('for', `apu04-${key}`);
  const input = document.createElement('select');
  input.id = `apu04-${key}`;
  input.name = key;

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '(sin especificar)';
  input.appendChild(emptyOption);

  for (const optionValue of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    input.appendChild(option);
  }

  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return { wrapper, input };
}

