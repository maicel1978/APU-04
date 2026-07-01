/**
 * Constructores de componentes visuales pequeños y reutilizables (botón,
 * insignia, encabezado de pantalla), para una apariencia consistente entre
 * pantallas sin duplicar marcado. Solo estilo/estructura; sin lógica de negocio.
 */

/**
 * Crea un <button> con las clases de estilo del sistema de diseño.
 * `variant`: 'primary' | 'secondary' | 'ghost' | 'danger-outline'.
 *
 * @param {string} label
 * @param {() => void} onClick
 * @param {{ variant?: string, type?: string, block?: boolean }} [options]
 * @returns {HTMLButtonElement}
 */
export function buildButton(label, onClick, options = {}) {
  const { variant = 'secondary', type = 'button', block = false } = options;
  const button = document.createElement('button');
  button.type = type;
  button.className = `btn btn-${variant}${block ? ' btn-block' : ''}`;
  button.textContent = label;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

/**
 * Crea una insignia visual (<span class="badge">) con una variante de color.
 * `variant`: 'danger' | 'warning' | 'success' | 'neutral'.
 *
 * @param {string} text
 * @param {string} variant
 * @returns {HTMLSpanElement}
 */
export function buildBadge(text, variant = 'neutral') {
  const badge = document.createElement('span');
  badge.className = `badge badge-${variant}`;
  badge.textContent = text;
  return badge;
}

/**
 * Muestra u oculta un contenedor de aviso (role="alert"/"status"/"note")
 * según tenga o no texto, evitando cajas vacías visibles en pantalla.
 *
 * @param {HTMLElement} el
 * @param {string} message
 */
export function setAlertText(el, message) {
  el.textContent = message ?? '';
  el.classList.toggle('is-hidden', !message);
}

/**
 * Crea el encabezado estándar de una pantalla dentro de una tarjeta:
 * título (h2) y, opcionalmente, un subtítulo explicativo breve.
 *
 * @param {string} title
 * @param {string} [hint]
 * @returns {DocumentFragment}
 */
export function buildScreenHeader(title, hint) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement('h2');
  heading.textContent = title;
  fragment.appendChild(heading);
  if (hint) {
    const hintEl = document.createElement('p');
    hintEl.className = 'section-hint';
    hintEl.textContent = hint;
    fragment.appendChild(hintEl);
  }
  return fragment;
}
