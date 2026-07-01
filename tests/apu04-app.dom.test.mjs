/**
 * Cubre: src/ui/app.js — integración de extremo a extremo: ingestión de
 * speakers.json → formulario de covariates → listas de PII → pipeline de
 * limpieza (Worker simulado) → revisión humana → finalización → exportación.
 * Usa jsdom y el fixture real caso-001-entrada.json (adaptado a la forma de
 * speakers.json, con "id" en vez de "segmentId").
 *
 * El Worker real (basado en window.Worker) no existe en Node/jsdom; se
 * inyecta un `workerFactory` de prueba que ejecuta el mismo pipeline real
 * de forma asíncrona, cumpliendo el contrato de mensajería ya verificado en
 * tests/apu04-worker.test.mjs.
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

const { initApp } = await import('../src/ui/app.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');

const glossaryEntries = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsTemplate = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const entrada = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-entrada.json'), 'utf-8'),
);

// speakers.json (forma real de salida de APU-03, docs/CONTRACTS.md §5):
// usa "id" por segmento, y no incluye studyId/covariates (los provee el
// formulario, no el pipeline ASR/diarización anterior).
const speakersJson = {
  segments: entrada.segments.map(({ segmentId, ...rest }) => ({ id: segmentId, ...rest })),
};

function makeFakeWorkerFactory() {
  return function fakeWorkerFactory() {
    const listeners = { message: [], error: [] };
    return {
      addEventListener(type, handler) {
        listeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      },
      postMessage({ canonicalInput, glossaryEntries: g, nerPatterns }) {
        // Ejecuta el pipeline real de forma asíncrona, igual que lo haría un
        // Worker real, cumpliendo el mismo contrato RUN_PIPELINE -> PIPELINE_RESULT.
        runCleanPipeline(canonicalInput, g, nerPatterns)
          .then(({ cleanJson, piiBuffer }) => {
            for (const handler of [...listeners.message]) {
              handler({ data: { type: 'PIPELINE_RESULT', cleanJson, piiBuffer } });
            }
          })
          .catch((error) => {
            for (const handler of [...listeners.message]) {
              handler({ data: { type: 'PIPELINE_ERROR', message: error.message } });
            }
          });
      },
    };
  };
}

function makeFakeSessionStore() {
  const saved = [];
  return {
    store: saved,
    saveSession(sessionId, data) {
      saved.push({ sessionId, data });
    },
    loadSession() {
      return null;
    },
    clearSession() {},
  };
}

let root;
beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  window.alert = () => {};
});
afterEach(() => {
  root.remove();
});

function makeSpeakersFile() {
  return new File([JSON.stringify(speakersJson)], 'speakers.json', { type: 'application/json' });
}

function selectFile(fileInput, file) {
  Object.defineProperty(fileInput, 'files', { value: [file], writable: false, configurable: true });
  fileInput.dispatchEvent(new Event('change'));
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('initApp lanza un error claro si faltan las dependencias base (glosario/patrones NER)', () => {
  assert.throws(() => initApp(root, undefined), /Faltan los datos base/);
  assert.throws(() => initApp(root, { glossaryEntries: [] }), /Faltan los datos base/);
});

test('initApp: flujo completo de un caso, de la ingestión a la exportación', async () => {
  const sessionStore = makeFakeSessionStore();
  initApp(root, {
    glossaryEntries,
    nerPatternsTemplate,
    sessionStore,
    workerFactory: makeFakeWorkerFactory(),
  });

  // 1) Ingestión: selecciona speakers.json.
  const fileInput = root.querySelector('input[type="file"]');
  assert.ok(fileInput, 'debe existir el input de archivo de ingestión');
  selectFile(fileInput, makeSpeakersFile());
  await flushMicrotasks();

  // 2) Formulario de covariates: se completa y se envía.
  const form = root.querySelector('form[aria-label="Formulario de datos del estudio y covariables"]');
  assert.ok(form, 'debe renderizarse el formulario de covariates tras cargar speakers.json');
  form.querySelector('#apu04-studyId').value = 'estudio-ansiedad-2026';
  form.querySelector('#apu04-caseId').value = 'caso-001';
  form.querySelector('#apu04-group').value = 'intervencion';
  form.querySelector('#apu04-moment').value = 'pre';
  form.querySelector('#apu04-sex').value = 'F';
  form.querySelector('#apu04-age').value = '34';
  form.querySelector('#apu04-site').value = 'Hospital Central';
  form.querySelector('#apu04-diagnosis').value = 'Trastorno de ansiedad generalizada';
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  // 3) Formulario de listas de PII: se envía con un nombre real a enmascarar.
  const piiForm = root.querySelector('form[aria-label="Listas manuales de nombres y direcciones a enmascarar"]');
  assert.ok(piiForm, 'debe renderizarse el formulario de listas de PII tras enviar covariates');
  piiForm.querySelector('#apu04-pii-names').value = 'Juan Perez';
  piiForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  await flushMicrotasks();

  // 4) Pantalla de revisión: debe existir con los 6 segmentos del fixture.
  const reviewItems = root.querySelectorAll('li[data-segment-id]');
  assert.equal(reviewItems.length, entrada.segments.length);
  assert.ok(sessionStore.store.length > 0, 'debe autoguardar el progreso al terminar el pipeline');

  // El nombre real "Juan Perez" no debe aparecer en cleanedText de ningún segmento
  // (regla dura de privacidad, docs/CONTRACTS.md §4/§6).
  const lastSaved = sessionStore.store[sessionStore.store.length - 1].data;
  for (const segment of lastSaved.segments) {
    assert.doesNotMatch(segment.cleanedText, /Juan Perez/i);
  }

  // 5) Acepta todos los segmentos anómalos y sin revisar hasta poder finalizar.
  const pendingAnomalous = () =>
    [...root.querySelectorAll('li[data-segment-id]')].filter(
      (li) => li.querySelector('strong').textContent.includes('ANÓMALO') && li.textContent.includes('(pendiente)'),
    );
  const finalizeButton = () => [...root.querySelectorAll('button')].find((b) => b.textContent.includes('Finalizar'));
  let guard = 0;
  while (pendingAnomalous().length > 0 && guard < 10) {
    const item = pendingAnomalous()[0];
    const acceptButton = [...item.querySelectorAll('button')].find((b) => b.textContent.includes('Aceptar'));
    acceptButton.click();
    guard += 1;
  }

  assert.ok(finalizeButton(), 'debe existir el botón de finalizar en la pantalla de revisión');
  assert.equal(finalizeButton().disabled, false, 'el botón de finalizar debe habilitarse tras revisar los anómalos');

  // 6) Finaliza la revisión.
  finalizeButton().click();

  // 7) Pantalla de exportación.
  const exportHeading = [...root.querySelectorAll('h2')].find((h) => h.textContent.includes('exportación'));
  assert.ok(exportHeading, 'debe mostrarse la pantalla de exportación tras finalizar');
  const cleanJsonButton = [...root.querySelectorAll('button')].find((b) => b.textContent.includes('clean.json'));
  assert.ok(cleanJsonButton, 'debe existir el botón de descarga de clean.json');
});

test('initApp muestra un mensaje de error claro si el archivo seleccionado no es JSON válido', async () => {
  initApp(root, { glossaryEntries, nerPatternsTemplate, sessionStore: makeFakeSessionStore() });

  const fileInput = root.querySelector('input[type="file"]');
  const badFile = new File(['esto no es json'], 'roto.json', { type: 'application/json' });
  selectFile(fileInput, badFile);
  await flushMicrotasks();

  const errorBox = root.querySelector('[role="alert"]');
  assert.match(errorBox.textContent, /No se pudo leer el archivo/);
});
