/**
 * Cubre: src/core/batch-controller.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFileBase, buildBatchDashboard } from '../src/core/batch-controller.js';

// --- buildFileBase -----------------------------------------------------------

test('buildFileBase deriva un nombre base saneado, sin extensión', () => {
  assert.equal(buildFileBase('Estudio Ansiedad 2026_Caso 001_speakers.json'), 'estudio-ansiedad-2026-caso-001-speakers');
});

test('buildFileBase usa un valor de reserva si el nombre queda vacío tras sanear', () => {
  assert.equal(buildFileBase('.json'), 'archivo');
  assert.equal(buildFileBase(''), 'archivo');
  assert.equal(buildFileBase(null), 'archivo');
});

test('buildFileBase colapsa guiones múltiples y recorta guiones al inicio/fin', () => {
  assert.equal(buildFileBase('  --Caso---001--.json'), 'caso-001');
});

// --- buildBatchDashboard ------------------------------------------------------

test('buildBatchDashboard con lote vacío no lanza y devuelve totales en cero', () => {
  const dashboard = buildBatchDashboard([]);
  assert.equal(dashboard.totalFiles, 0);
  assert.equal(dashboard.totalSegments, 0);
  assert.equal(dashboard.wpmAverage, 0);
  assert.deepEqual(dashboard.perFile, []);
});

test('buildBatchDashboard con entrada no-array no lanza (defensivo, R6)', () => {
  assert.doesNotThrow(() => buildBatchDashboard(null));
  assert.doesNotThrow(() => buildBatchDashboard(undefined));
  assert.equal(buildBatchDashboard(null).totalFiles, 0);
});

test('buildBatchDashboard agrega totales correctamente entre varios archivos', () => {
  const dashboard = buildBatchDashboard([
    { fileName: 'a.json', base: 'a', qualityReport: { totalSegments: 4, totalWords: 40, anomalousCount: 1, wpmAverage: 100 } },
    { fileName: 'b.json', base: 'b', qualityReport: { totalSegments: 6, totalWords: 60, anomalousCount: 3, wpmAverage: 120 } },
  ]);
  assert.equal(dashboard.totalSegments, 10);
  assert.equal(dashboard.totalWords, 100);
  assert.equal(dashboard.anomalousCount, 4);
  assert.equal(dashboard.anomalousPercentage, 40);
  // wpm promedio ponderado por segmentos: (100*4 + 120*6) / 10 = 112
  assert.equal(dashboard.wpmAverage, 112);
});

test('buildBatchDashboard marca needsReview=true si hay anomalousPercentage>0 o suspiciousTermsCount>0', () => {
  const dashboard = buildBatchDashboard([
    { fileName: 'a.json', base: 'a', qualityReport: { totalSegments: 2, anomalousPercentage: 0, suspiciousTermsCount: 0 } },
    { fileName: 'b.json', base: 'b', qualityReport: { totalSegments: 2, anomalousPercentage: 0, suspiciousTermsCount: 1 } },
  ]);
  assert.equal(dashboard.perFile.find((f) => f.base === 'a').needsReview, false);
  assert.equal(dashboard.perFile.find((f) => f.base === 'b').needsReview, true);
});

test('buildBatchDashboard maneja qualityReport ausente/parcial sin lanzar (defensivo, R6)', () => {
  const dashboard = buildBatchDashboard([{ fileName: 'a.json', base: 'a' }]);
  assert.equal(dashboard.perFile[0].totalSegments, 0);
  assert.equal(dashboard.perFile[0].needsReview, false);
});
