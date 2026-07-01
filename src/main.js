/**
 * Punto de arranque: carga assets/data/*.json vía import de módulo JSON
 * nativo (`with { type: 'json' }`, requiere servir por HTTP — ver `npm start`)
 * e inicia la interfaz. Reporta éxito/fallo a `window.__apu04Boot` (definido
 * en index.html) para mostrar un mensaje claro si algo falla al arrancar, en
 * vez de dejar una página en blanco.
 */

import glossary from '../assets/data/glossary.json' with { type: 'json' };
import nerPatternsTemplate from '../assets/data/ner-patterns.json' with { type: 'json' };
import { initApp } from './ui/app.js';

const rootElement = document.getElementById('app');

try {
  initApp(rootElement, {
    glossaryEntries: glossary.entries,
    nerPatternsTemplate,
  });
  window.__apu04Boot?.hide();
} catch (error) {
  window.__apu04Boot?.fail(
    error instanceof Error ? error.message : 'Ocurrió un error inesperado al iniciar la aplicación.',
  );
}
