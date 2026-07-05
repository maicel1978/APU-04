/**
 * Cubre: src/ui/app.js — integración de extremo a extremo con jsdom:
 * ingestión de un lote de 2 speakers.json (Regla 2: Batch) → privacidad
 * (Regla 3, opt-in) → limpieza (Worker simulado) → Dashboard APU-04D →
 * Vista de Diálogo Continuo → exportación. Sin Worker real (no existe en
 * Node/jsdom): se inyecta `workerFactory` con un doble que cumple el mismo
 * contrato de eventos que src/ui/worker-client.js espera.
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

const { initApp } = await import('../src/ui/app.js');
const { runCleanPipeline } = await import('../src/core/clean-pipeline.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const glossaryEntries = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'glossary.json'), 'utf-8'),
).entries;
const nerPatternsTemplate = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'assets', 'data', 'ner-patterns.json'), 'utf-8'),
);
const speakersV3 = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'apu04', 'caso-001-speakers-v3.json'), 'utf-8'),
);

function makeFakeFile(name, contentObject) {
  const text = JSON.stringify(contentObject);
  return { name, text: async () => text };
}

function makeFakeWorkerFactory() {
  return function createFakeWorker() {
    const listeners = { message: [], error: [] };
    return {
      addEventListener(type, handler) {
        listeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      },
      async postMessage(payload) {
        try {
          const { cleanJson, piiBuffer } = await runCleanPipeline(
            payload.canonicalInput,
            payload.glossaryEntries,
            payload.nerPatterns,
            Boolean(payload.nerOptInActive),
          );
          for (const handler of [...listeners.message]) handler({ data: { type: 'PIPELINE_RESULT', cleanJson, piiBuffer } });
        } catch (error) {
          for (const handler of [...listeners.message]) {
            handler({ data: { type: 'PIPELINE_ERROR', message: error.message } });
          }
        }
      },
    };
  };
}

async function driveIngestAndPrivacy(root, files, { activateNer = false } = {}) {
  const fileInput = root.querySelector('.dropzone-input');
  Object.defineProperty(fileInput, 'files', { value: files, configurable: true });
  fileInput.dispatchEvent(new Event('change'));

  // Esperar a que se resuelvan las promesas de lectura de archivo (macrotask real).
  await new Promise((resolve) => setTimeout(resolve, 0));

  if (activateNer) {
    const toggle = root.querySelector('#apu04-ner-opt-in');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  }
  root.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  // Esperar a que el pipeline (async, vía "Worker" simulado, incluye sha256Hex
  // real) resuelva para todos los archivos del lote.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

test('flujo completo con lote de 2 archivos: ingestión -> privacidad -> dashboard', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);

  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory() });

  const fileA = makeFakeFile('estudio_caso-a_speakers.json', speakersV3);
  const fileB = makeFakeFile('estudio_caso-b_speakers.json', speakersV3);
  await driveIngestAndPrivacy(root, [fileA, fileB]);

  assert.match(root.textContent, /Panel de calidad/);
  const fileRows = root.querySelectorAll('.file-row');
  assert.equal(fileRows.length, 2);

  document.body.removeChild(root);
});

test('sin activar el modo confidencial (default): el texto no se enmascara en el diálogo', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);

  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory() });
  const fileA = makeFakeFile('estudio_caso-a_speakers.json', speakersV3);
  await driveIngestAndPrivacy(root, [fileA], { activateNer: false });

  root.querySelector('.file-row-button').click();
  assert.match(root.textContent, /juan perez/i, 'sin opt-in, no debe enmascararse (el fixture no tiene NER configurado por defecto de todas formas, pero valida que la pantalla de diálogo se abre)');

  document.body.removeChild(root);
});

test('rechaza inicializar sin dependencias base (glosario/patrones)', () => {
  const root = document.createElement('div');
  assert.throws(() => initApp(root, {}), /Faltan los datos base/);
});

test('rechaza un elemento raíz inválido', () => {
  assert.throws(() => initApp(null, { glossaryEntries, nerPatternsTemplate }), /elemento raíz/);
});

// --- mejoras 2026-07: Ayuda y Diccionario de correcciones incorporados -----

function createInMemoryGlossaryStore() {
  let saved = [];
  return {
    loadOverrides: () => saved,
    saveOverrides: (entries) => { saved = entries; },
    clearOverrides: () => { saved = []; },
  };
}

test('mejora: el botón Ayuda, visible desde el inicio, muestra contenido de ayuda', () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory(), glossaryStore: createInMemoryGlossaryStore() });

  const helpButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ayuda');
  assert.ok(helpButton, 'debe existir un botón de Ayuda visible desde el inicio');
  helpButton.click();
  assert.match(root.textContent, /Diccionario de correcciones/);

  document.body.removeChild(root);
});

test('mejora: el botón Ayuda vuelve a la pantalla anterior (no siempre al inicio)', () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory(), glossaryStore: createInMemoryGlossaryStore() });

  // Entra al Diccionario desde la pantalla de inicio.
  const glossaryButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Diccionario de correcciones');
  glossaryButton.click();
  assert.match(root.textContent, /Como aparece en el texto/);

  // Abre Ayuda desde ahí, y al volver debe regresar al Diccionario, no al inicio.
  const helpButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ayuda');
  helpButton.click();
  const backButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Volver');
  backButton.click();
  assert.match(root.textContent, /Diccionario de correcciones/);
  assert.match(root.textContent, /Como aparece en el texto/);

  document.body.removeChild(root);
});

test('mejora: un término agregado al diccionario de correcciones persiste en el glossaryStore inyectado', () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const glossaryStore = createInMemoryGlossaryStore();
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory(), glossaryStore });

  const glossaryButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Diccionario de correcciones');
  glossaryButton.click();

  root.querySelector('#glossary-wrong').value = 'IAM';
  root.querySelector('#glossary-correct').value = 'infarto agudo de miocardio';
  root.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  const saved = glossaryStore.loadOverrides();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].wrong, 'IAM');

  document.body.removeChild(root);
});

test('mejora: las entradas guardadas del diccionario se cargan al iniciar la aplicación (persisten entre sesiones)', () => {
  const glossaryStore = createInMemoryGlossaryStore();
  glossaryStore.saveOverrides([{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }]);

  const root = document.createElement('div');
  document.body.appendChild(root);
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory(), glossaryStore });

  const glossaryButton = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Diccionario de correcciones');
  glossaryButton.click();
  assert.match(root.textContent, /IAM/);
  assert.match(root.textContent, /infarto agudo de miocardio/);

  document.body.removeChild(root);
});

// --- regresión: un lote SIN covariables en ningún archivo no debe romper
// nada ni mostrar secciones vacías/confusas de "grupo" (idea del usuario:
// las covariables no siempre están presentes) --------------------------------

test('regresión: un lote donde ningún archivo trae covariables funciona igual, sin mostrar secciones de grupo vacías', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory() });

  const speakersSinCovariables = {
    ...speakersV3,
    speakers: speakersV3.speakers.map((s) => ({ ...s, covariates: {} })),
  };
  const fileA = makeFakeFile('sin-covariables-a_speakers.json', speakersSinCovariables);
  const fileB = makeFakeFile('sin-covariables-b_speakers.json', speakersSinCovariables);
  await driveIngestAndPrivacy(root, [fileA, fileB]);

  // El panel de calidad debe cargar con normalidad...
  assert.match(root.textContent, /Panel de calidad/);
  assert.equal(root.querySelectorAll('.file-row').length, 2);
  // ...pero sin la tarjeta de grupos (no hay nada que mostrar).
  assert.equal(root.textContent.includes('Grupos y variables del estudio'), false);

  // Al entrar al diálogo de un archivo, tampoco debe aparecer el selector de covariable.
  root.querySelector('.file-row-button').click();
  assert.equal(root.querySelector('select[aria-label="Filtrar por grupo u otra variable del estudio"]'), null);

  document.body.removeChild(root);
});

test('regresión: un lote donde solo ALGUNOS archivos traen covariables no lanza y muestra el resumen con lo disponible', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  initApp(root, { glossaryEntries, nerPatternsTemplate, workerFactory: makeFakeWorkerFactory() });

  const speakersSinCovariables = {
    ...speakersV3,
    speakers: speakersV3.speakers.map((s) => ({ ...s, covariates: {} })),
  };
  const fileA = makeFakeFile('con-covariables_speakers.json', speakersV3); // trae grupo_estudio/sitio
  const fileB = makeFakeFile('sin-covariables_speakers.json', speakersSinCovariables);
  await driveIngestAndPrivacy(root, [fileA, fileB]);

  assert.match(root.textContent, /Panel de calidad/);
  assert.match(root.textContent, /Grupos y variables del estudio/);
  assert.match(root.textContent, /grupo_estudio/);

  document.body.removeChild(root);
});
