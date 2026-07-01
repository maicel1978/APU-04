/**
 * Cubre: src/main.js — carga el módulo real (incluidos los imports de
 * módulo JSON nativo `with { type: 'json' }`) en jsdom, y verifica que
 * reporte correctamente éxito o fallo de arranque a `window.__apu04Boot`
 * (ver index.html, mecanismo de respaldo si la app no logra iniciar).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installDomEnv } from './helpers/dom-env.mjs';

let teardown;

test('src/main.js reporta éxito (__apu04Boot.hide) cuando initApp arranca correctamente', async () => {
  ({ teardown } = installDomEnv());
  try {
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);

    let hideCalled = false;
    window.__apu04Boot = {
      hide: () => {
        hideCalled = true;
      },
      fail: () => {
        throw new Error('No debía llamarse a fail() en un arranque exitoso.');
      },
    };

    await import(`../src/main.js?case=success-${Date.now()}`);

    assert.equal(hideCalled, true);
    assert.ok(document.getElementById('app').children.length > 0, 'la app debe haber renderizado algo');
  } finally {
    teardown();
  }
});

test('src/main.js reporta el fallo (__apu04Boot.fail) con un mensaje claro cuando initApp lanza', async () => {
  ({ teardown } = installDomEnv());
  try {
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);

    // Simula un entorno donde initApp fallará de verdad: sin localStorage
    // disponible, createSessionStore() (llamado dentro de initApp) lanza.
    delete global.localStorage;
    delete window.localStorage;

    let failMessage = null;
    window.__apu04Boot = {
      hide: () => {
        throw new Error('No debía llamarse a hide() cuando initApp falla.');
      },
      fail: (message) => {
        failMessage = message;
      },
    };

    await import(`../src/main.js?case=failure-${Date.now()}`);

    assert.ok(failMessage, 'debe reportarse un mensaje de fallo');
    assert.match(failMessage, /almacenamiento local/);
  } finally {
    teardown();
  }
});

test('src/main.js no lanza sin capturar aunque window.__apu04Boot no exista (compatibilidad opcional)', async () => {
  ({ teardown } = installDomEnv());
  try {
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);

    // No se define window.__apu04Boot: main.js debe usar optional chaining y
    // no lanzar un TypeError por "Cannot read properties of undefined".
    await assert.doesNotReject(import(`../src/main.js?case=no-fallback-${Date.now()}`));
  } finally {
    teardown();
  }
});
