/**
 * Cubre: src/ui/export-screen.js (renderizado DOM). Usa jsdom y el pipeline
 * real sobre el fixture canónico, finalizando antes de exportar.
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

const { renderExportScreen } = await import('../src/ui/export-screen.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');
const { acceptSegment, finalizeCleanJson } = await import('../src/ui/review-view.js');
const { buildCleanedPackage } = await import('../src/core/export-package.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsBase = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-canonico.json'), 'utf-8'),
);

async function buildFinalizedCleanJson(nerOptInActive) {
  const nerPatterns = structuredClone(nerPatternsBase);
  nerPatterns.listMatchers[0].values = ['juan perez'];
  nerPatterns.listMatchers[1].values = ['hospital central'];
  const { cleanJson, piiBuffer } = await runCleanPipeline(entrada, glossary, nerPatterns, nerOptInActive);
  const reviewed = cleanJson.segments.map((s) => (s.anomalous ? acceptSegment(s) : s));
  const finalized = finalizeCleanJson({ ...cleanJson, segments: reviewed });
  return { cleanJson: finalized, piiBuffer };
}

test('muestra advertencia y no botones de descarga si no está finalizado', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const notFinalized = { ...cleanJson, auditLog: { ...cleanJson.auditLog, finalizedByHuman: false } };
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', notFinalized, null);
  assert.match(container.textContent, /todavía no fue finalizada/);
  assert.equal(container.querySelectorAll('.download-card').length, 0);
});

test('genera los 5 archivos del paquete canónico con nombres [base]_[stage].[ext]', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, null);

  const filenames = [...container.querySelectorAll('.download-filename')].map((el) => el.textContent);
  assert.ok(filenames.includes('caso-001_cleaned.json'));
  assert.ok(filenames.includes('caso-001_cleaned.csv'));
  assert.ok(filenames.includes('caso-001_quality_report.json'));
  assert.ok(filenames.includes('caso-001_edit_log.csv'));
  assert.ok(filenames.includes('caso-001_trazabilidad.json'));
});

test('mejora: el archivo principal descargado NO trae traza forense (usa buildCleanedPackage, no cleanJson crudo)', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');

  let capturedFilename = null;
  let capturedData = null;
  const originalBlob = global.Blob;
  global.Blob = class extends originalBlob {
    constructor(parts, opts) {
      super(parts, opts);
      capturedData = parts[0];
    }
  };
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      const originalClick = el.click.bind(el);
      Object.defineProperty(el, 'download', {
        get() { return this._download; },
        set(value) { capturedFilename = value; this._download = value; },
      });
      el.click = originalClick;
    }
    return el;
  };

  renderExportScreen(container, 'caso-001', cleanJson, null);
  const mainButton = container.querySelector('.download-card.is-highlight');
  mainButton.click();

  document.createElement = originalCreateElement;
  global.Blob = originalBlob;

  assert.equal(capturedFilename, 'caso-001_cleaned.json');
  const parsed = JSON.parse(capturedData);
  const expected = buildCleanedPackage(cleanJson);
  assert.deepEqual(parsed, expected);
  assert.equal(JSON.stringify(parsed).includes('modificationsLog'), false);
  assert.equal(JSON.stringify(parsed).includes('originalText'), false);
});

test('sin modo confidencial (piiBuffer null): no aparece la sección de registro de datos ocultados', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, null);
  assert.equal(container.textContent.includes('Registro de datos ocultados'), false);
});

test('con modo confidencial activo: aparece la sección de datos ocultados con advertencia', async () => {
  const { cleanJson, piiBuffer } = await buildFinalizedCleanJson(true);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, piiBuffer);
  assert.match(container.textContent, /Registro de datos ocultados/);
  assert.match(container.textContent, /no compartir/i);
  const filenames = [...container.querySelectorAll('.download-filename')].map((el) => el.textContent);
  assert.ok(filenames.includes('caso-001_pii-buffer.local.json'));
});

test('mejora: destaca visualmente el archivo principal y explica para qué sirve cada archivo', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, null);

  const highlighted = container.querySelector('.download-card.is-highlight');
  assert.ok(highlighted, 'debe existir un archivo destacado como principal');
  assert.match(highlighted.textContent, /úselo para el análisis/i);

  const descriptions = [...container.querySelectorAll('.download-description')].map((el) => el.textContent);
  assert.ok(descriptions.length >= 4, 'cada archivo debe tener una descripción de para qué sirve');
});

test('mejora: no usa nombres de módulo del ecosistema (APU-05) en el texto visible al usuario', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, null);
  assert.equal(/APU-0\d/.test(container.textContent), false);
});

test('mejora: muestra cuántas correcciones automáticas de puntuación se aplicaron', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  const container = document.createElement('div');
  renderExportScreen(container, 'caso-001', cleanJson, null);
  assert.match(container.textContent, /Texto ordenado automáticamente/);
});

test('rechaza un contenedor inválido', async () => {
  const { cleanJson } = await buildFinalizedCleanJson(false);
  assert.throws(() => renderExportScreen(null, 'caso-001', cleanJson, null), /contenedor válido/);
});
