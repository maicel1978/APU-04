/**
 * Cubre: src/ui/dashboard-view.js (renderizado DOM). Usa jsdom.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => teardown());

const { renderDashboardView } = await import('../src/ui/dashboard-view.js');
const { buildBatchDashboard } = await import('../src/core/batch-controller.js');

function makeDashboard() {
  return buildBatchDashboard([
    {
      fileName: 'caso-a_speakers.json',
      base: 'caso-a',
      qualityReport: { totalSegments: 10, totalWords: 100, anomalousCount: 3, anomalousPercentage: 30, longPauseCount: 1, suspiciousTermsCount: 2, wpmAverage: 120 },
    },
    {
      fileName: 'caso-b_speakers.json',
      base: 'caso-b',
      qualityReport: { totalSegments: 5, totalWords: 40, anomalousCount: 0, anomalousPercentage: 0, longPauseCount: 0, suspiciousTermsCount: 0, wpmAverage: 90 },
    },
  ]);
}

function noop() {}

test('muestra los totales agregados del lote', () => {
  const container = document.createElement('div');
  renderDashboardView(container, makeDashboard(), [], noop, noop, noop);
  const text = container.textContent;
  assert.match(text, /Panel de calidad/);
  assert.match(text, /15/); // totalSegments = 10 + 5
});

test('ordena los archivos que necesitan revisión primero (gestión por excepción, Regla 2)', () => {
  const container = document.createElement('div');
  renderDashboardView(container, makeDashboard(), [], noop, noop, noop);
  const rows = [...container.querySelectorAll('.file-row')];
  assert.equal(rows[0].dataset.base, 'caso-a');
  assert.equal(rows[0].dataset.needsReview, 'true');
  assert.equal(rows[1].dataset.needsReview, 'false');
});

test('invoca onOpenFile con el base correcto al hacer clic en un archivo', () => {
  const container = document.createElement('div');
  let openedBase = null;
  renderDashboardView(container, makeDashboard(), [], (base) => { openedBase = base; }, noop, noop);
  container.querySelector('.file-row-button').click();
  assert.equal(openedBase, 'caso-a');
});

test('invoca onContinue al pulsar el botón de continuar', () => {
  const container = document.createElement('div');
  let continued = false;
  renderDashboardView(container, makeDashboard(), [], noop, () => { continued = true; }, noop);
  const buttons = [...container.querySelectorAll('.actions-row button')];
  const continueButton = buttons.find((b) => b.textContent === 'Empezar a revisar');
  assert.ok(continueButton, 'debe existir el botón "Empezar a revisar"');
  continueButton.click();
  assert.equal(continued, true);
});

test('invoca onOpenGlossary al pulsar el botón del diccionario de correcciones', () => {
  const container = document.createElement('div');
  let opened = false;
  renderDashboardView(container, makeDashboard(), [], noop, noop, () => { opened = true; });
  const buttons = [...container.querySelectorAll('button')];
  const glossaryButton = buttons.find((b) => b.textContent.includes('Diccionario'));
  glossaryButton.click();
  assert.equal(opened, true);
});

test('mejora: muestra palabras/frases repetidas cuando hay suficientes segmentos', () => {
  const container = document.createElement('div');
  const filesData = [{
    speakers: [],
    segments: [
      { cleanedText: 'El paciente presentó un infarto agudo de miocardio.' },
      { cleanedText: 'Otro infarto fue reportado la semana pasada.' },
      { cleanedText: 'El infarto no dejó secuelas graves.' },
    ],
  }];
  renderDashboardView(container, makeDashboard(), filesData, noop, noop, noop);
  assert.match(container.textContent, /Palabras y frases más repetidas/);
  assert.match(container.textContent, /infarto/);
});

test('no muestra la sección de términos repetidos si no hay segmentos', () => {
  const container = document.createElement('div');
  renderDashboardView(container, makeDashboard(), [], noop, noop, noop);
  assert.equal(container.textContent.includes('Palabras y frases más repetidas'), false);
});

// --- resumen por grupo/covariable (mejora 2026-07) --------------------------

test('mejora: muestra el resumen de grupos/covariables con el conteo agregado del lote', () => {
  const container = document.createElement('div');
  const filesData = [
    {
      speakers: [{ id: 'spk-1', covariates: { grupo_estudio: 'Intervención' } }],
      segments: [{ speakerId: 'spk-1' }, { speakerId: 'spk-1' }],
    },
    {
      speakers: [{ id: 'spk-2', covariates: { grupo_estudio: 'Control' } }],
      segments: [{ speakerId: 'spk-2' }],
    },
  ];
  renderDashboardView(container, makeDashboard(), filesData, noop, noop, noop);
  assert.match(container.textContent, /Grupos y variables del estudio/);
  assert.match(container.textContent, /grupo_estudio/);
  assert.match(container.textContent, /Intervención/);
  assert.match(container.textContent, /Control/);
});

test('no muestra el resumen de grupos/covariables si ningún archivo tiene covariables', () => {
  const container = document.createElement('div');
  const filesData = [{ speakers: [{ id: 'spk-1', covariates: {} }], segments: [{ speakerId: 'spk-1' }] }];
  renderDashboardView(container, makeDashboard(), filesData, noop, noop, noop);
  assert.equal(container.textContent.includes('Grupos y variables del estudio'), false);
});

test('mejora: no usa nombres de módulo del ecosistema en el texto visible al usuario', () => {
  const container = document.createElement('div');
  renderDashboardView(container, makeDashboard(), [], noop, noop, noop);
  assert.equal(/APU-0\d/.test(container.textContent), false);
});

test('rechaza un contenedor inválido', () => {
  assert.throws(() => renderDashboardView(null, makeDashboard(), [], noop, noop, noop), /contenedor válido/);
});
