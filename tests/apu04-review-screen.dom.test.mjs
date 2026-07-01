/**
 * Cubre: src/ui/review-screen.js (renderizado DOM). Usa jsdom y el pipeline
 * real (src/core/clean-pipeline.js) sobre el fixture existente
 * caso-001-entrada.json, en vez de datos sintéticos triviales.
 */

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installDomEnv } from './helpers/dom-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => {
  teardown();
});

const { renderReviewScreen } = await import('../src/ui/review-screen.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');

const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsTemplate = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

async function buildFreshCleanJson() {
  const nerPatterns = { ...nerPatternsTemplate, listMatchers: nerPatternsTemplate.listMatchers.map((m) => ({ ...m })) };
  nerPatterns.listMatchers.find((m) => m.source === 'covariates.site').values = ['Hospital Central'];
  nerPatterns.listMatchers.find((m) => m.source === 'studio-consentimiento').values = ['Juan Perez'];
  const { cleanJson } = await runCleanPipeline(entrada, glossary, nerPatterns);
  return cleanJson;
}

let container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  // Evita ruido de "Not implemented: window.alert" en jsdom durante los tests
  // que fuerzan una edición inválida (ya cubiertos por review-view.test.mjs a
  // nivel de lógica pura; aquí solo verificamos que la UI no se rompe).
  window.alert = () => {};
});
afterEach(() => {
  container.remove();
});

test('renderReviewScreen muestra todos los segmentos del caso, priorizando los anómalos primero', async () => {
  const cleanJson = await buildFreshCleanJson();
  renderReviewScreen(container, cleanJson, () => {}, () => {});

  const items = container.querySelectorAll('li');
  assert.equal(items.length, cleanJson.segments.length);
  // El primer segmento de la cola debe ser un segmento anómalo (prioridad más alta).
  const firstItemText = items[0].querySelector('strong').textContent;
  assert.match(firstItemText, /ANÓMALO/);
});

test('renderReviewScreen deshabilita "Finalizar" mientras haya segmentos anómalos sin revisar', async () => {
  const cleanJson = await buildFreshCleanJson();
  renderReviewScreen(container, cleanJson, () => {}, () => {});

  const finalizeButton = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Finalizar'),
  );
  assert.equal(finalizeButton.disabled, true);
});

test('renderReviewScreen: aceptar todos los segmentos anómalos habilita "Finalizar"', async () => {
  const cleanJson = await buildFreshCleanJson();
  let latestState = cleanJson;
  renderReviewScreen(
    container,
    cleanJson,
    (updated) => {
      latestState = updated;
    },
    () => {},
  );

  // Acepta, uno por uno, cada segmento anómalo (el DOM se re-renderiza tras cada clic).
  let anomalousPending = latestState.segments.filter((s) => s.anomalous);
  while (anomalousPending.length > 0) {
    const segmentId = anomalousPending[0].segmentId;
    const item = container.querySelector(`li[data-segment-id="${segmentId}"]`);
    const acceptButton = [...item.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Aceptar'),
    );
    acceptButton.click();
    anomalousPending = latestState.segments.filter((s) => s.anomalous && !hasHumanEntry(s));
  }

  const finalizeButton = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Finalizar'),
  );
  assert.equal(finalizeButton.disabled, false);
});

test('renderReviewScreen: finalizar llama a onFinalize con auditLog.finalizedByHuman true', async () => {
  const cleanJson = await buildFreshCleanJson();
  let latestState = cleanJson;
  let finalized = null;
  renderReviewScreen(
    container,
    cleanJson,
    (updated) => {
      latestState = updated;
    },
    (finalizedCleanJson) => {
      finalized = finalizedCleanJson;
    },
  );

  let anomalousPending = latestState.segments.filter((s) => s.anomalous);
  while (anomalousPending.length > 0) {
    const segmentId = anomalousPending[0].segmentId;
    const item = container.querySelector(`li[data-segment-id="${segmentId}"]`);
    const acceptButton = [...item.querySelectorAll('button')].find((b) => b.textContent.includes('Aceptar'));
    acceptButton.click();
    anomalousPending = latestState.segments.filter((s) => s.anomalous && !hasHumanEntry(s));
  }

  const finalizeButton = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes('Finalizar'),
  );
  finalizeButton.click();

  assert.ok(finalized);
  assert.equal(finalized.auditLog.finalizedByHuman, true);
});

test('renderReviewScreen: editar un segmento actualiza cleanedText vía onProgress', async () => {
  const cleanJson = await buildFreshCleanJson();
  let latestState = cleanJson;
  renderReviewScreen(
    container,
    cleanJson,
    (updated) => {
      latestState = updated;
    },
    () => {},
  );

  const firstSegmentId = cleanJson.segments[0].segmentId;
  const item = container.querySelector(`li[data-segment-id="${firstSegmentId}"]`);
  const editButton = [...item.querySelectorAll('button')].find((b) => b.textContent.includes('Editar'));
  editButton.click();

  const textarea = item.querySelector('textarea');
  textarea.value = 'Texto corregido manualmente.';
  const saveButton = [...item.querySelectorAll('button')].find((b) => b.textContent.includes('Guardar'));
  saveButton.click();

  const updatedSegment = latestState.segments.find((s) => s.segmentId === firstSegmentId);
  assert.equal(updatedSegment.cleanedText, 'Texto corregido manualmente.');
  assert.equal(updatedSegment.editedByHuman, true);
});

function hasHumanEntry(segment) {
  return segment.modificationsLog.some((entry) => entry.type === 'human');
}
