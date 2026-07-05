/**
 * Cubre: src/utils/download.js. Usa jsdom para simular document/Blob/URL.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let dom;

before(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Blob = dom.window.Blob;
  global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  // jsdom no implementa createObjectURL/revokeObjectURL; se provee un doble mínimo
  // suficiente para probar que downloadTextFile los invoca correctamente.
  global.URL = class extends dom.window.URL {};
  global.URL.createObjectURL = () => 'blob:fake-url';
  global.URL.revokeObjectURL = () => {};
});

after(() => {
  delete global.window;
  delete global.document;
  delete global.Blob;
  delete global.URL;
  delete global.HTMLAnchorElement;
});

const { downloadTextFile, downloadJsonFile, downloadCsvFile, buildFileName } = await import(
  '../src/utils/download.js'
);

test('downloadTextFile crea un enlace temporal, lo hace click y lo remueve del DOM', () => {
  let clicked = false;
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      el.click = () => {
        clicked = true;
      };
    }
    return el;
  };

  downloadTextFile('archivo.txt', 'contenido');
  assert.equal(clicked, true);
  assert.equal(document.body.querySelector('a'), null);

  document.createElement = originalCreateElement;
});

test('downloadTextFile rechaza nombre de archivo vacío o contenido no-string', () => {
  assert.throws(() => downloadTextFile('', 'x'), /nombre de archivo/);
  assert.throws(() => downloadTextFile('x.txt', null), /contenido/);
});

test('downloadJsonFile serializa el objeto como JSON indentado', () => {
  let capturedBlobParts = null;
  const originalBlob = global.Blob;
  global.Blob = class extends originalBlob {
    constructor(parts, opts) {
      super(parts, opts);
      capturedBlobParts = parts;
    }
  };

  downloadJsonFile('x.json', { a: 1 });
  assert.equal(capturedBlobParts[0], JSON.stringify({ a: 1 }, null, 2));

  global.Blob = originalBlob;
});

test('downloadCsvFile usa el tipo MIME text/csv', () => {
  let capturedType = null;
  const originalBlob = global.Blob;
  global.Blob = class extends originalBlob {
    constructor(parts, opts) {
      super(parts, opts);
      capturedType = opts.type;
    }
  };

  downloadCsvFile('x.csv', 'a,b\n1,2');
  assert.match(capturedType, /text\/csv/);

  global.Blob = originalBlob;
});

test('buildFileName sigue la convención [base]_[stage].[ext] y sanea caracteres inválidos', () => {
  assert.equal(buildFileName('Estudio Ansiedad 2026 Caso 001', 'cleaned', 'json'), 'estudio-ansiedad-2026-caso-001_cleaned.json');
});

test('buildFileName usa un valor de reserva si base es null', () => {
  assert.equal(buildFileName(null, 'cleaned', 'json'), 'archivo_cleaned.json');
});
