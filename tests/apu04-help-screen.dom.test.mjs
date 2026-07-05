/**
 * Cubre: src/ui/help-screen.js (renderizado DOM). Usa jsdom.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => teardown());

const { renderHelpScreen } = await import('../src/ui/help-screen.js');

test('muestra contenido de ayuda en lenguaje simple', () => {
  const container = document.createElement('div');
  renderHelpScreen(container, () => {});
  assert.match(container.textContent, /Diccionario de correcciones/);
  assert.match(container.textContent, /Alt\+A/);
});

test('no usa nombres de módulo del ecosistema en el texto de ayuda', () => {
  const container = document.createElement('div');
  renderHelpScreen(container, () => {});
  assert.equal(/APU-0\d/.test(container.textContent), false);
});

test('el botón Volver invoca onBack', () => {
  const container = document.createElement('div');
  let wentBack = false;
  renderHelpScreen(container, () => { wentBack = true; });
  const backButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Volver');
  backButton.click();
  assert.equal(wentBack, true);
});

test('rechaza un contenedor inválido', () => {
  assert.throws(() => renderHelpScreen(null, () => {}), /contenedor válido/);
});
