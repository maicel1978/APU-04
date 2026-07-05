/**
 * Cubre: src/ui/glossary-screen.js (renderizado DOM). Usa jsdom.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => teardown());

const { renderGlossaryScreen } = await import('../src/ui/glossary-screen.js');

test('muestra las entradas existentes', () => {
  const container = document.createElement('div');
  renderGlossaryScreen(container, [{ wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true }], () => {}, () => {});
  assert.match(container.textContent, /IAM/);
  assert.match(container.textContent, /infarto agudo de miocardio/);
});

test('muestra un estado vacío si no hay entradas', () => {
  const container = document.createElement('div');
  renderGlossaryScreen(container, [], () => {}, () => {});
  assert.match(container.textContent, /Todavía no hay términos guardados/);
});

test('agregar un término nuevo llama a onSave con la lista actualizada, marcado como exact', () => {
  const container = document.createElement('div');
  let saved = null;
  renderGlossaryScreen(container, [], (entries) => { saved = entries; }, () => {});

  container.querySelector('#glossary-wrong').value = 'IAM';
  container.querySelector('#glossary-correct').value = 'infarto agudo de miocardio';
  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  assert.equal(saved.length, 1);
  assert.equal(saved[0].wrong, 'IAM');
  assert.equal(saved[0].exact, true);
  assert.match(container.textContent, /IAM/);
});

test('no agrega una entrada con campos vacíos', () => {
  const container = document.createElement('div');
  let saveCalls = 0;
  renderGlossaryScreen(container, [], () => { saveCalls += 1; }, () => {});

  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(saveCalls, 0);
});

test('quitar un término llama a onSave sin esa entrada', () => {
  const container = document.createElement('div');
  let saved = null;
  const initial = [
    { wrong: 'IAM', correct: 'infarto agudo de miocardio', exact: true },
    { wrong: 'HTA', correct: 'hipertensión arterial', exact: true },
  ];
  renderGlossaryScreen(container, initial, (entries) => { saved = entries; }, () => {});

  const removeButtons = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Quitar');
  removeButtons[0].click();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].wrong, 'HTA');
});

test('el botón Volver invoca onBack', () => {
  const container = document.createElement('div');
  let wentBack = false;
  renderGlossaryScreen(container, [], () => {}, () => { wentBack = true; });
  const backButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Volver');
  backButton.click();
  assert.equal(wentBack, true);
});

test('rechaza un contenedor inválido', () => {
  assert.throws(() => renderGlossaryScreen(null, [], () => {}, () => {}), /contenedor válido/);
});
