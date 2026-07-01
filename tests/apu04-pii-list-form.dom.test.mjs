/**
 * Cubre: src/ui/pii-list-form.js (renderizado DOM). Usa jsdom, ver
 * tests/helpers/dom-env.mjs.
 */

import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;

before(() => {
  ({ teardown } = installDomEnv());
});

after(() => {
  teardown();
});

const { renderPiiListForm } = await import('../src/ui/pii-list-form.js');

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  // jsdom usa document.getElementById como atajo interno de querySelector('#id');
  // si el formulario reutiliza IDs fijos (apu04-pii-names) entre renders y el
  // contenedor de un test anterior sigue colgado en document.body, esa búsqueda
  // puede resolver al elemento "viejo" en vez de al del contenedor actual. Se
  // limpia el DOM entre tests para evitar IDs duplicados en el mismo documento.
  container.remove();
});

test('renderPiiListForm muestra la declaración obligatoria sobre reglas/listas (no IA estadística)', () => {
  renderPiiListForm(container, () => {});
  const disclosure = container.querySelector('[role="note"]');
  assert.ok(disclosure);
  assert.match(disclosure.textContent, /reglas y listas, no en inteligencia artificial estadística/);
});

test('renderPiiListForm renderiza los dos campos de texto (nombres y direcciones)', () => {
  renderPiiListForm(container, () => {});
  assert.ok(container.querySelector('#apu04-pii-names'));
  assert.ok(container.querySelector('#apu04-pii-addresses'));
});

test('renderPiiListForm llama a onSubmit con las listas ya parseadas al enviar', () => {
  let captured = null;
  renderPiiListForm(container, (result) => {
    captured = result;
  });

  const namesTextarea = container.querySelector('#apu04-pii-names');
  const addressesTextarea = container.querySelector('#apu04-pii-addresses');
  namesTextarea.value = 'Juan Pérez\nAna Ruiz';
  addressesTextarea.value = 'Calle Falsa 123';

  const form = container.querySelector('form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(captured, {
    manualNames: ['Juan Pérez', 'Ana Ruiz'],
    manualAddresses: ['Calle Falsa 123'],
  });
});

test('renderPiiListForm permite enviar listas vacías (no bloquea el flujo)', () => {
  let captured = null;
  renderPiiListForm(container, (result) => {
    captured = result;
  });

  const form = container.querySelector('form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(captured, { manualNames: [], manualAddresses: [] });
});

test('renderPiiListForm lanza un error claro si el contenedor no es válido', () => {
  assert.throws(() => renderPiiListForm(null, () => {}), /contenedor válido/);
});
