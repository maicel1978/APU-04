/**
 * Cubre: src/ui/pii-settings-form.js (renderizado DOM). Usa jsdom.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;
before(() => {
  ({ teardown } = installDomEnv());
});
after(() => teardown());

const { renderPiiSettingsForm } = await import('../src/ui/pii-settings-form.js');

test('el toggle de modo confidencial inicia apagado (Regla 3: off por defecto)', () => {
  const container = document.createElement('div');
  renderPiiSettingsForm(container, () => {});
  const toggle = container.querySelector('#apu04-ner-opt-in');
  assert.equal(toggle.checked, false);
});

test('las listas manuales están ocultas hasta activar el toggle', () => {
  const container = document.createElement('div');
  renderPiiSettingsForm(container, () => {});
  const wrapper = container.querySelector('.field-grid');
  assert.equal(wrapper.hidden, true);

  const toggle = container.querySelector('#apu04-ner-opt-in');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  assert.equal(wrapper.hidden, false);
});

test('onSubmit recibe nerOptInActive=false y listas vacías si no se activa nada', () => {
  const container = document.createElement('div');
  let received = null;
  renderPiiSettingsForm(container, (result) => {
    received = result;
  });
  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(received.nerOptInActive, false);
  assert.deepEqual(received.manualNames, []);
});

test('onSubmit recibe las listas manuales parseadas cuando el toggle está activo', () => {
  const container = document.createElement('div');
  let received = null;
  renderPiiSettingsForm(container, (result) => {
    received = result;
  });

  container.querySelector('#apu04-ner-opt-in').checked = true;
  container.querySelector('#apu04-pii-names').value = 'Juan Pérez\nAna Ruiz';
  container.querySelector('#apu04-pii-hospitals').value = 'Hospital Central';
  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  assert.equal(received.nerOptInActive, true);
  assert.deepEqual(received.manualNames, ['Juan Pérez', 'Ana Ruiz']);
  assert.deepEqual(received.manualHospitals, ['Hospital Central']);
});

test('rechaza un contenedor inválido', () => {
  assert.throws(() => renderPiiSettingsForm(null, () => {}), /contenedor válido/);
});
