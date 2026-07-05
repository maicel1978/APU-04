/**
 * Cubre: src/ui/dialogue-view.js (renderizado DOM, filtros, atajos de
 * teclado, preservación de foco en la búsqueda). Usa jsdom y el pipeline
 * real sobre el fixture canónico.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => teardown());

const { renderDialogueView } = await import('../src/ui/dialogue-view.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatterns = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
);

async function buildCleanJson() {
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns, false);
  return cleanJson;
}

test('renderiza una burbuja por segmento, en orden cronológico', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});
  const bubbles = [...container.querySelectorAll('.dialogue-bubble')];
  assert.equal(bubbles.length, cleanJson.segments.length);
  assert.equal(bubbles[0].dataset.segmentId, 'seg-001');
  view.destroy();
});

test('mejora: muestra el motivo legible de la anomalía junto al segmento, no solo un badge', async () => {
  const cleanJson = await buildCleanJson();
  // Fuerza un motivo de anomalía conocido en el primer segmento para la prueba.
  cleanJson.segments[0].anomalous = true;
  cleanJson.segments[0].anomalyReason = 'Ritmo de habla inusualmente alto (posible error de transcripción o superposición de hablantes).';

  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  const reasonEl = firstBubble.querySelector('.anomaly-reason');
  assert.ok(reasonEl, 'debe existir un elemento visible con el motivo de la anomalía');
  assert.match(reasonEl.textContent, /ritmo de habla inusualmente alto/i);
  assert.equal(firstBubble.getAttribute('aria-describedby'), reasonEl.id);

  view.destroy();
});

test('no muestra el bloque de motivo si el segmento no es anómalo', async () => {
  const cleanJson = await buildCleanJson();
  cleanJson.segments[0].anomalous = false;
  cleanJson.segments[0].anomalyReason = null;

  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});
  const firstBubble = container.querySelector('.dialogue-bubble');
  assert.equal(firstBubble.querySelector('.anomaly-reason'), null);
  view.destroy();
});

test('filtro de estado "Anómalos" reduce la lista y preserva la barra de herramientas', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const toolbar = container.querySelector('.dialogue-toolbar');
  const buttons = [...toolbar.querySelectorAll('button')];
  const anomalousButton = buttons.find((b) => b.textContent === 'Anómalos');
  anomalousButton.click();

  const bubbles = [...container.querySelectorAll('.dialogue-bubble')];
  const expectedCount = cleanJson.segments.filter((s) => s.anomalous).length;
  assert.equal(bubbles.length, expectedCount);
  // La barra de herramientas sigue siendo el mismo nodo (no se recreó).
  assert.equal(container.querySelector('.dialogue-toolbar'), toolbar);
  view.destroy();
});

test('la búsqueda instantánea filtra sin destruir el input (preserva el foco, Regla 4)', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const searchInput = container.querySelector('input[type="search"]');
  searchInput.focus();
  assert.equal(document.activeElement, searchInput);

  searchInput.value = 'logística';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

  // El mismo elemento de búsqueda sigue en el DOM y con el foco.
  assert.equal(container.querySelector('input[type="search"]'), searchInput);
  assert.equal(document.activeElement, searchInput);

  const bubbles = [...container.querySelectorAll('.dialogue-bubble')];
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].dataset.segmentId, 'seg-001');

  view.destroy();
  document.body.removeChild(container);
});

test('Alt+A acepta el segmento con foco activo y lo marca como revisado', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let progressed = null;
  const view = renderDialogueView(container, cleanJson, (updated) => { progressed = updated; }, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  firstBubble.dispatchEvent(new Event('focus', { bubbles: false }));

  const event = new window.KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);

  assert.ok(progressed, 'onProgress debe haberse llamado tras Alt+A');
  const seg001 = progressed.segments.find((s) => s.segmentId === 'seg-001');
  assert.equal(seg001.editedByHuman, true);

  view.destroy();
  document.body.removeChild(container);
});

test('Alt+E abre el editor del segmento con foco activo', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  firstBubble.dispatchEvent(new Event('focus', { bubbles: false }));

  const event = new window.KeyboardEvent('keydown', { key: 'e', altKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);

  assert.ok(container.querySelector('textarea'), 'debe abrirse el editor tras Alt+E');

  view.destroy();
  document.body.removeChild(container);
});

test('Ctrl+Enter en el editor guarda la edición', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let progressed = null;
  const view = renderDialogueView(container, cleanJson, (updated) => { progressed = updated; }, () => {});

  const editButton = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Editar'));
  editButton.click();

  const textarea = container.querySelector('textarea');
  textarea.value = 'Texto editado a mano.';
  const event = new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
  textarea.dispatchEvent(event);

  const seg001 = progressed.segments.find((s) => s.segmentId === 'seg-001');
  assert.equal(seg001.cleanedText, 'Texto editado a mano.');

  view.destroy();
  document.body.removeChild(container);
});

test('destroy() elimina el listener global de teclado (sin fugas de eventos entre pantallas)', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let progressed = null;
  const view = renderDialogueView(container, cleanJson, (updated) => { progressed = updated; }, () => {});
  view.destroy();
  container.remove();

  const event = new window.KeyboardEvent('keydown', { key: 'f', altKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);

  assert.equal(progressed, null, 'tras destroy(), los atajos no deben seguir activos');
});

test('rechaza un contenedor inválido', async () => {
  const cleanJson = await buildCleanJson();
  assert.throws(() => renderDialogueView(null, cleanJson, () => {}, () => {}), /contenedor válido/);
});

// --- filtro por covariable/grupo (mejora 2026-07) ---------------------------

test('mejora: muestra el selector de grupo/covariable cuando speakers[] tiene covariables', async () => {
  const cleanJson = await buildCleanJson(); // fixture: spk-2 tiene grupo_estudio y sitio
  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const covariateSelect = container.querySelector('select[aria-label="Filtrar por grupo u otra variable del estudio"]');
  assert.ok(covariateSelect, 'debe existir el selector de grupo/covariable');
  const optionLabels = [...covariateSelect.options].map((o) => o.textContent);
  assert.ok(optionLabels.includes('grupo_estudio: Intervención'));
  assert.ok(optionLabels.includes('sitio: Hospital Central'));

  view.destroy();
});

test('mejora: filtrar por covariable reduce la lista a los segmentos del hablante correspondiente', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const covariateSelect = container.querySelector('select[aria-label="Filtrar por grupo u otra variable del estudio"]');
  covariateSelect.value = 'grupo_estudio\u0000Intervención';
  covariateSelect.dispatchEvent(new Event('change'));

  const bubbles = [...container.querySelectorAll('.dialogue-bubble')];
  const expectedCount = cleanJson.segments.filter((s) => s.speakerId === 'spk-2').length;
  assert.equal(bubbles.length, expectedCount);

  view.destroy();
});

test('mejora: muestra la etiqueta de grupo/covariable del hablante junto a su nombre en la burbuja', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const bubbleWithCovariate = [...container.querySelectorAll('.dialogue-bubble')].find(
    (b) => b.dataset.segmentId === cleanJson.segments.find((s) => s.speakerId === 'spk-2').segmentId,
  );
  assert.match(bubbleWithCovariate.textContent, /grupo_estudio: Intervención/);

  view.destroy();
});

test('no muestra el selector de grupo/covariable si ningún hablante tiene covariables', async () => {
  const cleanJson = await buildCleanJson();
  const withoutCovariates = { ...cleanJson, speakers: cleanJson.speakers.map((s) => ({ ...s, covariates: {} })) };
  const container = document.createElement('div');
  const view = renderDialogueView(container, withoutCovariates, () => {}, () => {});

  assert.equal(container.querySelector('select[aria-label="Filtrar por grupo u otra variable del estudio"]'), null);

  view.destroy();
});

// --- mejoras de eficiencia (2026-07): auto-avanzar y saltar a pendientes ---

test('mejora: tras Aceptar (Alt+A), el foco avanza automáticamente al siguiente segmento pendiente', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  firstBubble.dispatchEvent(new Event('focus', { bubbles: false }));

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));

  const focused = document.activeElement;
  assert.ok(focused.classList.contains('dialogue-bubble'), 'el foco debe quedar en una burbuja de segmento');
  assert.notEqual(focused.dataset.segmentId, 'seg-001', 'debe haber avanzado a otro segmento');
  assert.equal(focused.dataset.status, 'pending', 'debe aterrizar en un segmento pendiente, no revisado');

  view.destroy();
  document.body.removeChild(container);
});

test('mejora: Alt+ArrowDown salta directo al siguiente segmento pendiente sin aceptar/editar nada', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  let progressed = null;
  const view = renderDialogueView(container, cleanJson, (updated) => { progressed = updated; }, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  firstBubble.dispatchEvent(new Event('focus', { bubbles: false }));

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));

  assert.equal(progressed, null, 'Alt+ArrowDown no debe modificar ningún segmento, solo mover el foco');
  const focused = document.activeElement;
  assert.ok(focused.classList.contains('dialogue-bubble'));
  assert.notEqual(focused.dataset.segmentId, 'seg-001');

  view.destroy();
  document.body.removeChild(container);
});

test('mejora: Alt+ArrowUp salta al pendiente anterior (dirección inversa a Alt+ArrowDown)', async () => {
  const cleanJson = await buildCleanJson();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const bubbles = [...container.querySelectorAll('.dialogue-bubble')];
  bubbles[2].dispatchEvent(new Event('focus', { bubbles: false }));

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));

  const focused = document.activeElement;
  assert.ok(focused.classList.contains('dialogue-bubble'));
  assert.notEqual(focused.dataset.segmentId, bubbles[2].dataset.segmentId);

  view.destroy();
  document.body.removeChild(container);
});

test('mejora: saltar a pendientes no lanza si todos los segmentos ya están revisados', async () => {
  const cleanJson = await buildCleanJson();
  cleanJson.segments = cleanJson.segments.map((s) => ({
    ...s,
    modificationsLog: [...s.modificationsLog, { timestamp: new Date().toISOString(), type: 'human', before: s.cleanedText, after: s.cleanedText }],
  }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = renderDialogueView(container, cleanJson, () => {}, () => {});

  const firstBubble = container.querySelector('.dialogue-bubble');
  firstBubble.dispatchEvent(new Event('focus', { bubbles: false }));

  assert.doesNotThrow(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
  });

  view.destroy();
  document.body.removeChild(container);
});
