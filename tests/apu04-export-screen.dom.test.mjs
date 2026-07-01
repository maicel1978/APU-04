/**
 * Cubre: src/ui/export-screen.js (renderizado DOM). Usa jsdom y el pipeline
 * real sobre el fixture existente, aceptando todos los segmentos y
 * finalizando antes de exportar.
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

const { renderExportScreen } = await import('../src/ui/export-screen.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');
const { acceptSegment, finalizeCleanJson } = await import('../src/ui/review-view.js');

const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsTemplate = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

async function buildFinalizedCleanJsonAndBuffer() {
  const nerPatterns = { ...nerPatternsTemplate, listMatchers: nerPatternsTemplate.listMatchers.map((m) => ({ ...m })) };
  nerPatterns.listMatchers.find((m) => m.source === 'covariates.site').values = ['Hospital Central'];
  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns);
  let state = cleanJson;
  state = { ...state, segments: state.segments.map((s) => acceptSegment(s)) };
  state = finalizeCleanJson(state);
  return { cleanJson: state, piiBuffer };
}

let container;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  container.remove();
});

test('renderExportScreen muestra un resumen de calidad con los totales del caso', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJsonAndBuffer();
  renderExportScreen(container, cleanJson, piiBuffer);

  const dl = container.querySelector('dl');
  assert.ok(dl);
  assert.match(dl.textContent, new RegExp(String(cleanJson.segments.length)));
});

test('renderExportScreen bloquea la exportación si el caso no está finalizado', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJsonAndBuffer();
  const notFinalized = { ...cleanJson, auditLog: { ...cleanJson.auditLog, finalizedByHuman: false } };

  renderExportScreen(container, notFinalized, piiBuffer);

  const alertBox = container.querySelector('[role="alert"]');
  assert.match(alertBox.textContent, /todavía no fue finalizada/);
  assert.equal(container.querySelectorAll('button').length, 0);
});

test('renderExportScreen ofrece un botón de descarga para cada vista derivada más clean.json', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJsonAndBuffer();
  renderExportScreen(container, cleanJson, piiBuffer);

  const buttonLabels = [...container.querySelectorAll('button')].map((b) => b.textContent);
  assert.ok(buttonLabels.some((t) => t.includes('clean.json')));
  assert.ok(buttonLabels.some((t) => t.includes('clean.txt')));
  assert.ok(buttonLabels.some((t) => t.includes('clean.csv')));
  assert.ok(buttonLabels.some((t) => t.includes('quality-report.json')));
  assert.ok(buttonLabels.some((t) => t.includes('glossary-hits.json')));
  assert.ok(buttonLabels.some((t) => t.includes('flagged-segments.json')));
  assert.ok(buttonLabels.some((t) => t.includes('edit-log.csv')));
  assert.ok(buttonLabels.some((t) => t.includes('pii-buffer.local.json')));
});

test('renderExportScreen muestra la advertencia de privacidad junto al botón de pii-buffer', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJsonAndBuffer();
  renderExportScreen(container, cleanJson, piiBuffer);

  const alertBox = container.querySelector('[role="alert"]');
  assert.match(alertBox.textContent, /No compartir ni subir a red/);
});

test('renderExportScreen: al hacer clic en "Descargar clean.json" dispara una descarga con el nombre canónico', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJsonAndBuffer();
  renderExportScreen(container, cleanJson, piiBuffer);

  let clicked = false;
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      el.click = () => {
        clicked = true;
        assert.match(el.download, /^estudio-ansiedad-2026_caso-001_clean\.json$/);
      };
    }
    return el;
  };

  const cleanJsonButton = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes('clean.json'),
  );
  cleanJsonButton.click();

  assert.equal(clicked, true);
  document.createElement = originalCreateElement;
});
