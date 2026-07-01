/**
 * Orquestador principal: cablea las 5 pantallas del flujo de un caso
 * (ingestión → covariates → PII → limpieza vía Worker → revisión → exportación)
 * dentro de un shell con indicador de progreso (assets/styles/app.css, CSS
 * puro sin frameworks). Un caso a la vez, ver docs/DECISIONS.md.
 * Probado con jsdom en tests/apu04-app.dom.test.mjs (flujo completo simulado).
 */

import { adaptSpeakersOutput } from '../core/ingest-adapter.js';
import { hydrateNerPatterns } from '../core/ner-patterns-loader.js';
import { checkSchemaVersion } from '../core/version-guard.js';
import { createSessionStore } from '../core/session-store.js';
import { renderCovariatesForm } from './covariates-form.js';
import { renderPiiListForm } from './pii-list-form.js';
import { renderReviewScreen } from './review-screen.js';
import { renderExportScreen } from './export-screen.js';
import { createWorkerClient, createCleanPipelineWorker, isWorkerSupported } from './worker-client.js';
import { runCleanPipeline } from '../core/clean-pipeline.js';
import { setAlertText } from './dom-helpers.js';

const STEPS = ['Archivo', 'Estudio', 'Privacidad', 'Revisión', 'Exportar'];

/**
 * Inicializa la aplicación completa dentro del elemento raíz dado, orquestando
 * las pantallas del flujo de un caso a la vez (docs/DECISIONS.md
 * §2.1): ingestión → covariates → listas de PII → limpieza (Worker) → revisión
 * humana → exportación.
 *
 * @param {HTMLElement} rootElement
 * @param {{ glossaryEntries: object[], nerPatternsTemplate: object, sessionStore?: object, workerFactory?: Function }} deps
 */
export function initApp(rootElement, deps) {
  if (!rootElement || typeof rootElement.appendChild !== 'function') {
    throw new Error('No se encontró el elemento raíz para iniciar la aplicación.');
  }
  if (!deps || !Array.isArray(deps.glossaryEntries) || typeof deps.nerPatternsTemplate !== 'object') {
    throw new Error('Faltan los datos base de la aplicación (glosario y patrones de PII).');
  }

  const sessionStore = deps.sessionStore ?? createSessionStore();
  const workerFactory = deps.workerFactory ?? (isWorkerSupported() ? createCleanPipelineWorker : null);

  rootElement.innerHTML = '';
  rootElement.className = 'app-shell';

  rootElement.appendChild(buildHeader());
  const stepperEl = buildStepper();
  rootElement.appendChild(stepperEl);

  const errorBox = document.createElement('p');
  errorBox.className = 'alert is-hidden';
  errorBox.setAttribute('role', 'alert');
  errorBox.setAttribute('aria-live', 'assertive');
  rootElement.appendChild(errorBox);

  const screenContainer = document.createElement('div');
  rootElement.appendChild(screenContainer);
  rootElement.appendChild(buildFooter());

  const caseState = { speakersJson: null, formResult: null, manualPii: null, cleanJson: null, piiBuffer: null };

  function setError(message) {
    setAlertText(errorBox, message);
  }

  function goToStep(index) {
    updateStepper(stepperEl, index);
    screenContainer.innerHTML = '';
  }

  function autosave() {
    if (!caseState.cleanJson) return;
    try {
      const sessionId = caseState.cleanJson.covariates?.caseId ?? 'sesion-sin-caseid';
      sessionStore.saveSession(sessionId, caseState.cleanJson);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo autoguardar el progreso.');
    }
  }

  renderIngestScreen();

  function renderIngestScreen() {
    goToStep(0);
    setError('');
    screenContainer.appendChild(buildIngestCard());
  }

  function buildIngestCard() {
    const card = document.createElement('div');
    card.className = 'card';

    const heading = document.createElement('h2');
    heading.textContent = 'Comenzar una entrevista';
    card.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'section-hint';
    hint.textContent =
      'Seleccione el archivo de hablantes exportado por la etapa anterior (speakers.json) para comenzar la limpieza de esta entrevista.';
    card.appendChild(hint);

    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone';

    const icon = document.createElement('div');
    icon.className = 'dropzone-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '↑';
    dropzone.appendChild(icon);

    const title = document.createElement('p');
    title.className = 'dropzone-title';
    title.textContent = 'Haga clic para elegir el archivo';
    dropzone.appendChild(title);

    const dzHint = document.createElement('p');
    dzHint.className = 'dropzone-hint';
    dzHint.textContent = 'Formato JSON — se procesa en este equipo, nunca se envía a ningún servidor.';
    dropzone.appendChild(dzHint);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    fileInput.className = 'dropzone-input';
    fileInput.setAttribute('aria-label', 'Seleccionar archivo de hablantes (speakers.json)');
    dropzone.appendChild(fileInput);

    card.appendChild(dropzone);

    fileInput.addEventListener('change', async (event) => {
      setError('');
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        caseState.speakersJson = JSON.parse(text);
        renderCovariatesScreen();
      } catch (error) {
        setError('No se pudo leer el archivo seleccionado. Verifique que sea un archivo JSON válido de hablantes.');
      }
    });

    return card;
  }

  function renderCovariatesScreen() {
    goToStep(1);
    const card = document.createElement('div');
    card.className = 'card';
    screenContainer.appendChild(card);

    renderCovariatesForm(card, (formResult) => {
      caseState.formResult = formResult;
      renderPiiListScreen();
    });
  }

  function renderPiiListScreen() {
    goToStep(2);
    const card = document.createElement('div');
    card.className = 'card';
    screenContainer.appendChild(card);

    renderPiiListForm(card, (piiResult) => {
      caseState.manualPii = piiResult;
      runPipelineAndShowReview();
    });
  }

  async function runPipelineAndShowReview() {
    setError('');
    screenContainer.innerHTML = '';
    screenContainer.appendChild(buildProcessingCard());

    try {
      const canonicalInput = adaptSpeakersOutput(caseState.speakersJson, caseState.formResult);
      const nerPatterns = hydrateNerPatterns(deps.nerPatternsTemplate, {
        site: canonicalInput.covariates.site,
        manualNames: caseState.manualPii.manualNames,
        manualAddresses: caseState.manualPii.manualAddresses,
      });

      const { cleanJson, piiBuffer } = await executePipeline(canonicalInput, deps.glossaryEntries, nerPatterns);

      const versionCheck = checkSchemaVersion(cleanJson);
      if (!versionCheck.ok) {
        setError(versionCheck.message);
        return;
      }

      caseState.cleanJson = cleanJson;
      caseState.piiBuffer = piiBuffer;
      autosave();
      renderReviewScreenWrapper();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo procesar la entrevista.');
    }
  }

  function buildProcessingCard() {
    const card = document.createElement('div');
    card.className = 'card';
    const note = document.createElement('p');
    note.className = 'note';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.textContent = 'Limpiando y anonimizando la entrevista en este equipo…';
    card.appendChild(note);
    return card;
  }

  async function executePipeline(canonicalInput, glossaryEntries, nerPatterns) {
    if (workerFactory) {
      const worker = workerFactory();
      const runPipeline = createWorkerClient(worker);
      return runPipeline({ canonicalInput, glossaryEntries, nerPatterns });
    }
    return runCleanPipeline(canonicalInput, glossaryEntries, nerPatterns);
  }

  function renderReviewScreenWrapper() {
    goToStep(3);
    renderReviewScreen(
      screenContainer,
      caseState.cleanJson,
      (updatedCleanJson) => {
        caseState.cleanJson = updatedCleanJson;
        autosave();
      },
      (finalizedCleanJson) => {
        caseState.cleanJson = finalizedCleanJson;
        autosave();
        renderExportScreenWrapper();
      },
    );
  }

  function renderExportScreenWrapper() {
    goToStep(4);
    renderExportScreen(screenContainer, caseState.cleanJson, caseState.piiBuffer);
  }
}

function buildHeader() {
  const header = document.createElement('header');
  header.className = 'app-header';

  const kicker = document.createElement('span');
  kicker.className = 'app-kicker';
  kicker.textContent = 'APU-04';
  header.appendChild(kicker);

  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = 'Limpieza y control de calidad de entrevistas';
  header.appendChild(title);

  const tagline = document.createElement('p');
  tagline.className = 'app-tagline';
  tagline.textContent = 'Todo el procesamiento ocurre en este equipo. Ningún dato sale a internet.';
  header.appendChild(tagline);

  return header;
}

function buildStepper() {
  const list = document.createElement('ol');
  list.className = 'stepper';
  list.setAttribute('aria-label', 'Progreso de la entrevista');

  STEPS.forEach((label, index) => {
    const item = document.createElement('li');
    item.className = 'stepper-item';
    item.dataset.stepIndex = String(index);

    const track = document.createElement('div');
    track.className = 'stepper-track';
    item.appendChild(track);

    const labelEl = document.createElement('span');
    labelEl.className = 'stepper-label';
    labelEl.textContent = label;
    item.appendChild(labelEl);

    list.appendChild(item);
  });

  updateStepper(list, 0);
  return list;
}

function updateStepper(list, activeIndex) {
  const items = list.querySelectorAll('.stepper-item');
  items.forEach((item, index) => {
    item.classList.toggle('is-active', index === activeIndex);
    item.classList.toggle('is-done', index < activeIndex);
  });
}

function buildFooter() {
  const footer = document.createElement('p');
  footer.className = 'app-footer';
  footer.textContent = 'APU-04 · Procesamiento 100% local, sin conexión a servidores externos.';
  return footer;
}
