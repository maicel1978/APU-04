/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Orquestador principal: ingestión de un archivo o lote (Regla 2 — Batch) →
 * privacidad opcional (Regla 3) → limpieza vía Worker (uno por archivo,
 * secuencial) → Panel de calidad (Regla 2) → Vista de Diálogo Continuo por
 * archivo (Regla 4) → descarga del paquete por archivo (docs/CONTRACTS.md
 * §4-8). Un solo Web Worker reutilizado para todo el lote
 * (docs/DECISIONS.md: Worker único, llamadas secuenciales).
 *
 * Mejoras 2026-07 (pedidas por el usuario): pantalla de Ayuda incorporada y
 * Diccionario de correcciones editable/persistente, accesibles desde
 * cualquier pantalla; lenguaje simple en todos los textos (sin nombres de
 * módulo del ecosistema, ver docs/DECISIONS.md).
 */

import { adaptSpeakersOutput } from '../core/ingest-adapter.js';
import { hydrateNerPatterns } from '../core/ner-patterns-loader.js';
import { checkOutputSchemaVersion } from '../core/version-guard.js';
import { createSessionStore } from '../core/session-store.js';
import { createGlossaryStore, mergeGlossaryEntries } from '../core/glossary-store.js';
import { buildFileBase, buildBatchDashboard } from '../core/batch-controller.js';
import { buildQualityReport } from '../core/derived-views.js';
import { buildIngestCard } from './ingest-screen.js';
import { renderPiiSettingsForm } from './pii-settings-form.js';
import { renderDashboardView } from './dashboard-view.js';
import { renderDialogueView } from './dialogue-view.js';
import { renderExportScreen } from './export-screen.js';
import { renderGlossaryScreen } from './glossary-screen.js';
import { renderHelpScreen } from './help-screen.js';
import { createWorkerClient, createCleanPipelineWorker, isWorkerSupported } from './worker-client.js';
import { runCleanPipeline } from '../core/clean-pipeline.js';
import { setAlertText, buildButton } from './dom-helpers.js';

/**
 * Inicializa la aplicación completa dentro del elemento raíz dado.
 *
 * @param {HTMLElement} rootElement
 * @param {{ glossaryEntries: object[], nerPatternsTemplate: object, sessionStore?: object,
 *           glossaryStore?: object, workerFactory?: Function }} deps
 */
export function initApp(rootElement, deps) {
  if (!rootElement || typeof rootElement.appendChild !== 'function') {
    throw new Error('No se encontró el elemento raíz para iniciar la aplicación.');
  }
  if (!deps || !Array.isArray(deps.glossaryEntries) || typeof deps.nerPatternsTemplate !== 'object') {
    throw new Error('Faltan los datos base de la aplicación (glosario y patrones de privacidad).');
  }

  const sessionStore = deps.sessionStore ?? createSessionStore();
  const glossaryStore = deps.glossaryStore ?? createGlossaryStore();
  const workerFactory = deps.workerFactory ?? (isWorkerSupported() ? createCleanPipelineWorker : null);
  const worker = workerFactory ? workerFactory() : null;
  const runPipelineInWorker = worker ? createWorkerClient(worker) : null;

  let glossaryEntries = mergeGlossaryEntries(deps.glossaryEntries, glossaryStore.loadOverrides());

  rootElement.innerHTML = '';
  rootElement.className = 'app-shell';
  rootElement.appendChild(buildHeader(() => renderHelpScreenWrapper()));

  const errorBox = document.createElement('p');
  errorBox.className = 'alert is-hidden';
  errorBox.setAttribute('role', 'alert');
  errorBox.setAttribute('aria-live', 'assertive');
  rootElement.appendChild(errorBox);

  const screenContainer = document.createElement('div');
  rootElement.appendChild(screenContainer);
  rootElement.appendChild(buildFooter());

  /** @type {{ fileName: string, base: string, cleanJson: object, piiBuffer: object|null }[]} */
  let files = [];
  let privacySettings = null;
  let activeDialogue = null; // { destroy() } de la vista de diálogo actual, para limpieza de listeners.
  let previousScreen = renderIngestScreen; // para el botón Volver de Ayuda/Diccionario.

  function setError(message) {
    setAlertText(errorBox, message);
  }

  function goTo(screenBuilder) {
    activeDialogue?.destroy?.();
    activeDialogue = null;
    screenContainer.innerHTML = '';
    screenBuilder();
  }

  function autosave() {
    for (const file of files) {
      try {
        sessionStore.saveSession(file.base, file.cleanJson);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'No se pudo guardar el progreso automáticamente.');
      }
    }
  }

  renderIngestScreen();

  function renderIngestScreen() {
    previousScreen = renderIngestScreen;
    goTo(() => {
      setError('');
      screenContainer.appendChild(
        buildIngestCard({
          onFilesSelected: renderPrivacyScreen,
          onError: setError,
          onOpenGlossary: () => renderGlossaryScreenWrapper(renderIngestScreen),
        }),
      );
    });
  }

  function renderPrivacyScreen(parsedFiles) {
    previousScreen = () => renderPrivacyScreen(parsedFiles);
    goTo(() => {
      const card = document.createElement('div');
      card.className = 'card';
      screenContainer.appendChild(card);

      renderPiiSettingsForm(card, (settings) => {
        privacySettings = settings;
        runPipelineForAllFiles(parsedFiles);
      });
    });
  }

  async function runPipelineForAllFiles(parsedFiles) {
    goTo(() => screenContainer.appendChild(buildProcessingCard(parsedFiles.length)));
    setError('');

    const nerPatterns = hydrateNerPatterns(deps.nerPatternsTemplate, {
      manualNames: privacySettings.manualNames,
      manualHospitals: privacySettings.manualHospitals,
      manualAddresses: privacySettings.manualAddresses,
    });

    const results = [];
    try {
      for (const { fileName, speakersJson } of parsedFiles) {
        const base = buildFileBase(fileName);
        try {
          const canonicalInput = adaptSpeakersOutput(speakersJson, { sourceSession: base });
          const { cleanJson, piiBuffer } = await executePipeline(
            canonicalInput,
            glossaryEntries,
            nerPatterns,
            privacySettings.nerOptInActive,
          );

          const versionCheck = checkOutputSchemaVersion(cleanJson);
          if (!versionCheck.ok) {
            setError(`${fileName}: ${versionCheck.message}`);
            return;
          }
          results.push({ fileName, base, cleanJson, piiBuffer });
        } catch (error) {
          // Identifica el archivo que falló dentro del lote (Regla 2: batch de
          // varios archivos); antes el mensaje no indicaba cuál era.
          const detail = error instanceof Error ? error.message : 'No se pudo procesar este archivo.';
          setError(`${fileName}: ${detail}`);
          return;
        }
      }
      files = results;
      autosave();
      renderDashboardScreen();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo procesar el lote de archivos.');
    }
  }

  async function executePipeline(canonicalInput, entries, nerPatterns, nerOptInActive) {
    if (runPipelineInWorker) {
      return runPipelineInWorker({ canonicalInput, glossaryEntries: entries, nerPatterns, nerOptInActive });
    }
    // Reserva sin Worker (entorno sin soporte): mismo pipeline, hilo principal.
    return runCleanPipeline(canonicalInput, entries, nerPatterns, nerOptInActive);
  }

  function renderDashboardScreen() {
    previousScreen = renderDashboardScreen;
    goTo(() => {
      const fileReports = files.map((f) => ({ fileName: f.fileName, base: f.base, qualityReport: buildQualityReport(f.cleanJson) }));
      const dashboard = buildBatchDashboard(fileReports);
      const filesData = files.map((f) => ({ segments: f.cleanJson.segments, speakers: f.cleanJson.speakers }));
      renderDashboardView(
        screenContainer,
        dashboard,
        filesData,
        (base) => renderDialogueScreen(base),
        () => renderDialogueScreen(files[0]?.base),
        () => renderGlossaryScreenWrapper(renderDashboardScreen),
      );
    });
  }

  function renderDialogueScreen(base) {
    const file = files.find((f) => f.base === base);
    if (!file) return;

    previousScreen = () => renderDialogueScreen(base);
    goTo(() => {
      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'btn btn-ghost';
      backButton.textContent = '← Volver al panel de calidad';
      backButton.addEventListener('click', renderDashboardScreen);
      screenContainer.appendChild(backButton);

      activeDialogue = renderDialogueView(
        screenContainer,
        file.cleanJson,
        (updatedCleanJson) => {
          file.cleanJson = updatedCleanJson;
          autosave();
        },
        (finalizedCleanJson) => {
          file.cleanJson = finalizedCleanJson;
          autosave();
          renderExportScreenFor(file.base);
        },
      );
    });
  }

  function renderExportScreenFor(base) {
    const file = files.find((f) => f.base === base);
    if (!file) return;

    previousScreen = () => renderExportScreenFor(base);
    goTo(() => {
      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'btn btn-ghost';
      backButton.textContent = '← Volver al panel de calidad';
      backButton.addEventListener('click', renderDashboardScreen);
      screenContainer.appendChild(backButton);

      renderExportScreen(screenContainer, file.base, file.cleanJson, file.piiBuffer);
    });
  }

  function renderGlossaryScreenWrapper(backTo) {
    previousScreen = () => renderGlossaryScreenWrapper(backTo);
    goTo(() => {
      renderGlossaryScreen(screenContainer, glossaryEntries, (updatedEntries) => {
        glossaryEntries = updatedEntries;
        // Solo se guardan localmente las entradas nuevas/editadas por el
        // investigador, no el glosario base completo (src/core/glossary-store.js).
        const baseWrongKeys = new Set(deps.glossaryEntries.map((e) => e.wrong.trim().toLocaleLowerCase('es')));
        const overrides = updatedEntries.filter((e) => !baseWrongKeys.has(e.wrong.trim().toLocaleLowerCase('es')));
        try {
          glossaryStore.saveOverrides(overrides);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'No se pudo guardar el diccionario de correcciones.');
        }
      }, backTo);
    });
  }

  function renderHelpScreenWrapper() {
    const backTo = previousScreen;
    goTo(() => renderHelpScreen(screenContainer, backTo));
  }
}

function buildProcessingCard(fileCount) {
  const card = document.createElement('div');
  card.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Procesando…';
  card.appendChild(heading);
  const hint = document.createElement('p');
  hint.className = 'section-hint';
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  hint.textContent = `Limpiando ${fileCount} archivo(s). Esto ocurre en este equipo, sin conexión a internet.`;
  card.appendChild(hint);
  return card;
}

function buildHeader(onOpenHelp) {
  const header = document.createElement('header');
  header.className = 'app-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'app-header-row';

  const titleGroup = document.createElement('div');
  const title = document.createElement('h1');
  title.className = 'app-title';
  title.textContent = 'Limpieza y revisión de entrevistas';
  titleGroup.appendChild(title);
  const tagline = document.createElement('p');
  tagline.className = 'app-tagline';
  tagline.textContent = 'Todo ocurre en este equipo. Nada se envía a internet.';
  titleGroup.appendChild(tagline);
  titleRow.appendChild(titleGroup);

  titleRow.appendChild(buildButton('Ayuda', onOpenHelp, { variant: 'ghost' }));
  header.appendChild(titleRow);

  return header;
}

function buildFooter() {
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.textContent = 'Procesamiento local, sin conexión a internet.';
  return footer;
}
