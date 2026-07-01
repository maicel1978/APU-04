/**
 * Utilidad de pruebas: configura un entorno DOM mínimo con jsdom para
 * probar los módulos de src/ui/*.js que dependen de
 * `document`/`window`/`Blob`/`URL`, sin necesidad de un navegador real.
 * No forma parte del código de producción.
 */

import { JSDOM } from 'jsdom';

/**
 * Instala un entorno DOM global (jsdom) para la duración de un test o
 * conjunto de tests, y devuelve una función `teardown()` para restaurarlo.
 * Provee también dobles mínimos de `URL.createObjectURL`/`revokeObjectURL`
 * y `File`, ausentes o incompletos en jsdom.
 *
 * @returns {{ dom: JSDOM, teardown: () => void }}
 */
export function installDomEnv() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  const previous = {
    window: global.window,
    document: global.document,
    Blob: global.Blob,
    File: global.File,
    URL: global.URL,
    Event: global.Event,
    CustomEvent: global.CustomEvent,
    localStorage: global.localStorage,
    HTMLElement: global.HTMLElement,
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.Blob = dom.window.Blob;
  global.File = dom.window.File;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.localStorage = dom.window.localStorage;

  class FakeURL extends dom.window.URL {}
  FakeURL.createObjectURL = () => `blob:fake-${Math.random()}`;
  FakeURL.revokeObjectURL = () => {};
  global.URL = FakeURL;

  function teardown() {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete global[key];
      } else {
        global[key] = value;
      }
    }
  }

  return { dom, teardown };
}
