/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Módulo de agregación de lote (Regla 2 del encargo — Dashboard Transversal
 * APU-04D): funciones puras que combinan los `quality_report` individuales
 * de N archivos en una vista transversal para auditoría por excepción. No
 * ejecuta el pipeline en sí (eso es responsabilidad de src/ui/app.js, que
 * invoca el Worker una vez por archivo, ver docs/DECISIONS.md — Worker
 * único, llamadas secuenciales); este módulo solo agrega resultados ya
 * calculados, y por eso es testeable sin Worker ni DOM.
 */

/**
 * Deriva el nombre base `[base]` (docs/CONTRACTS.md §12) a partir del nombre
 * de archivo original, saneando caracteres no alfanuméricos a guion.
 * @param {string} fileName - p.ej. "estudio-ansiedad_caso-001_speakers.json"
 * @returns {string}
 */
export function buildFileBase(fileName) {
  const withoutExt = typeof fileName === 'string' ? fileName.replace(/\.[^./\\]+$/, '') : 'archivo';
  const sanitized = withoutExt
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized === '' ? 'archivo' : sanitized;
}

/**
 * Agrega los `quality_report` (docs/CONTRACTS.md §7) de todos los archivos
 * de un lote en una vista transversal para el Dashboard APU-04D: totales del
 * lote + detalle por archivo, permitiendo ordenar/filtrar por anomalía.
 *
 * @param {{ fileName: string, base: string, qualityReport: object }[]} fileReports
 * @returns {{
 *   totalFiles: number, totalSegments: number, totalWords: number,
 *   wpmAverage: number, anomalousCount: number, anomalousPercentage: number,
 *   longPauseCount: number, suspiciousTermsCount: number,
 *   perFile: { fileName: string, base: string, totalSegments: number,
 *              anomalousPercentage: number, suspiciousTermsCount: number,
 *              longPauseCount: number, needsReview: boolean }[]
 * }}
 */
export function buildBatchDashboard(fileReports) {
  const list = Array.isArray(fileReports) ? fileReports : [];

  const totals = list.reduce(
    (acc, entry) => {
      const report = entry.qualityReport ?? {};
      acc.totalSegments += report.totalSegments ?? 0;
      acc.totalWords += report.totalWords ?? 0;
      acc.anomalousCount += report.anomalousCount ?? 0;
      acc.longPauseCount += report.longPauseCount ?? 0;
      acc.suspiciousTermsCount += report.suspiciousTermsCount ?? 0;
      acc.wpmSum += (report.wpmAverage ?? 0) * (report.totalSegments ?? 0);
      return acc;
    },
    { totalSegments: 0, totalWords: 0, anomalousCount: 0, longPauseCount: 0, suspiciousTermsCount: 0, wpmSum: 0 },
  );

  const perFile = list.map((entry) => {
    const report = entry.qualityReport ?? {};
    return {
      fileName: entry.fileName,
      base: entry.base,
      totalSegments: report.totalSegments ?? 0,
      anomalousPercentage: report.anomalousPercentage ?? 0,
      suspiciousTermsCount: report.suspiciousTermsCount ?? 0,
      longPauseCount: report.longPauseCount ?? 0,
      // Gestión por excepción (Regla 2): marca los archivos que ameritan
      // revisión prioritaria, sin obligar a leer todo el lote linealmente.
      needsReview: (report.anomalousPercentage ?? 0) > 0 || (report.suspiciousTermsCount ?? 0) > 0,
    };
  });

  return {
    totalFiles: list.length,
    totalSegments: totals.totalSegments,
    totalWords: totals.totalWords,
    wpmAverage: totals.totalSegments > 0 ? round2(totals.wpmSum / totals.totalSegments) : 0,
    anomalousCount: totals.anomalousCount,
    anomalousPercentage: percentage(totals.anomalousCount, totals.totalSegments),
    longPauseCount: totals.longPauseCount,
    suspiciousTermsCount: totals.suspiciousTermsCount,
    perFile,
  };
}

function percentage(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 10000) / 100;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
