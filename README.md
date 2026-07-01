# APU-04 — Limpieza, normalización y anonimización de transcripciones

Aplicación web local-first para limpiar, corregir términos de dominio,
enmascarar información identificable (PII) y controlar la calidad de
transcripciones clínicas/cualitativas, con revisión humana obligatoria antes
de exportar. Sin backend, sin build step, sin conexión a internet.

Unidad **APU-04** dentro de un ecosistema mayor de procesamiento de
entrevistas (APU-01 preparación de audio → APU-02 transcripción → APU-03
diarización → **APU-04 limpieza/anonimización** → APU-05 análisis cualitativo
→ APU-06 exportación). Este repositorio es autocontenido: no depende de tener
las otras unidades instaladas para correr o probar.

## Ejecutar la aplicación

```bash
npm install
npm start
```

Abrir `http://127.0.0.1:8080/` en el navegador. **No abrir `index.html` con
doble clic**: el navegador bloquea los módulos ES y el Web Worker bajo el
protocolo `file://`; `index.html` detecta ese caso y muestra instrucciones,
pero la app no funciona ahí.

Flujo de uso (un caso/entrevista a la vez): seleccionar `speakers.json` →
completar datos del estudio → declarar nombres/direcciones a enmascarar
(opcional) → revisar cada segmento anómalo → finalizar → descargar
`clean.json` y las vistas derivadas.

## Ejecutar las pruebas

```bash
npm test
```

146 pruebas con el runner nativo de Node (`node --test`), sin dependencias de
producción nuevas. `jsdom` es la única `devDependency`, usada solo para
probar el DOM de la interfaz.

## Estructura del repositorio

```text
index.html              Punto de entrada
src/main.js             Carga assets/data/*.json e inicia la app
src/core/               Lógica pura: validación, pipeline de limpieza, glosario,
                         enmascarado de PII, telemetría, vistas derivadas
src/ui/                 Pantallas (DOM): formularios, revisión, exportación
src/utils/              Utilidades puras: hash, diff de texto, descarga de archivos
src/workers/            Web Worker que ejecuta el pipeline sin bloquear la UI
assets/data/            glossary.json y ner-patterns.json — editables sin tocar código
assets/styles/          Hoja de estilos (CSS puro, sin frameworks)
scripts/serve.mjs       Servidor estático local (solo módulos nativos de Node)
tests/                  Pruebas (node:test + jsdom) y fixtures realistas
docs/CONTRACTS.md       Formato de cada archivo de entrada/salida
docs/DECISIONS.md       Decisiones de diseño no obvias — leer antes de tocar código
```

## Principios de diseño (resumen; detalle en `docs/DECISIONS.md`)

1. 100% local: nada sale a internet. El único acceso a `fetch()` en todo
   `src/` es el Worker leyendo su propio código fuente (patrón Inline
   Worker), verificado por auditoría estática (`tests/apu04-static-audit.mjs`).
2. `originalText` es inmutable; `cleanedText` se congela tras la revisión
   humana final.
3. El enmascarado de PII es por reglas y listas (regex + diccionarios), no
   IA estadística — deliberado, no una limitación temporal.
4. Un caso/entrevista a la vez; sin procesamiento por lotes.
5. Interfaz en español.

## Stack

Vanilla JS (ES2022+ Modules, sin transpilar), CSS puro, Web Worker, Web
Crypto API. Node.js ≥18 solo para correr pruebas y el servidor de desarrollo.

## Licencia

MIT — ver `LICENSE`.
