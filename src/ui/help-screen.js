/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Pantalla de ayuda incorporada (mejora 2026-07, pedida por el usuario):
 * antes solo existía como archivo docs/MANUAL-USUARIO.md fuera de la
 * aplicación; ahora es una pantalla accesible con un clic desde cualquier
 * parte de la app. Contenido en lenguaje simple, sin nombres de módulo del
 * ecosistema ni jerga técnica — versión resumida del manual completo.
 */

import { buildButton } from './dom-helpers.js';

const SECTIONS = [
  {
    title: '¿Qué hace esta aplicación?',
    body:
      'Limpia y corrige el texto de sus entrevistas, revisa la calidad de la transcripción y, si usted lo decide, oculta nombres u otros datos que identifiquen personas. Todo ocurre en su computadora; nada se envía a internet.',
  },
  {
    title: '1. Cargar archivos',
    body:
      'Elija uno o varios archivos de la etapa anterior. Puede cargar una sola entrevista o todas las de un estudio a la vez.',
  },
  {
    title: '2. Privacidad',
    body:
      'Decida si quiere ocultar nombres, hospitales o direcciones. Está apagado por defecto: actívelo solo si su estudio lo requiere. Si lo activa, escriba una lista de lo que quiere ocultar; cada persona recibirá siempre la misma etiqueta en todo el texto.',
  },
  {
    title: '3. Panel de calidad',
    body:
      'Muestra un resumen y marca los archivos que conviene revisar primero. Puede pasar de largo los que ya están bien.',
  },
  {
    title: '4. Revisar el texto',
    body:
      'El texto se muestra como una conversación. Por cada parte marcada puede Aceptar (si está bien) o Editar (para corregirla usted mismo). Al aceptar o guardar, la aplicación avanza sola al siguiente pendiente. Atajos de teclado: Alt+A aceptar, Alt+E editar, Ctrl+Enter guardar, Alt+F terminar, Alt+flecha abajo/arriba para saltar entre pendientes.',
  },
  {
    title: '5. Diccionario de correcciones',
    body:
      'Si nota que distintas personas dicen lo mismo de formas diferentes (por ejemplo "IAM" y "ataque al corazón"), agregue una regla aquí para que la aplicación lo corrija siempre igual.',
  },
  {
    title: '6. Descargar los resultados',
    body:
      'Al terminar, descargue los archivos. El primero (marcado como principal) es el que debe usar en el siguiente paso del estudio; los demás son apoyo para revisar o auditar el trabajo.',
  },
  {
    title: '¿No puede editar el texto después de terminar?',
    body:
      'Es intencional: una vez terminada la revisión, el texto queda protegido para que el archivo que descargó no cambie después. Si necesita corregir algo, repita el proceso con el archivo original.',
  },
];

/**
 * Renderiza la pantalla de ayuda dentro de `container`.
 * @param {HTMLElement} container
 * @param {() => void} onBack
 */
export function renderHelpScreen(container, onBack) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('No se encontró un contenedor válido para la pantalla de ayuda.');
  }

  container.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  container.appendChild(card);

  const heading = document.createElement('h2');
  heading.textContent = 'Ayuda';
  card.appendChild(heading);

  for (const section of SECTIONS) {
    const sectionHeading = document.createElement('h3');
    sectionHeading.textContent = section.title;
    card.appendChild(sectionHeading);

    const body = document.createElement('p');
    body.className = 'section-hint';
    body.textContent = section.body;
    card.appendChild(body);
  }

  card.appendChild(buildButton('Volver', onBack, { variant: 'ghost' }));
}
