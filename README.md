# APU-04 — Limpieza, normalización y control de calidad

Aplicación web local-first para limpiar, corregir términos de dominio,
enmascarar información identificable (PII, opcional) y controlar la calidad
de transcripciones clínicas/cualitativas, con revisión humana obligatoria
antes de exportar. Sin backend, sin build step, sin conexión a internet.

Unidad **APU-04** dentro del ecosistema APU (APU-01 preparación de audio →
APU-02 transcripción → APU-03 hablantes/covariables →
**APU-04 limpieza/anonimización/control de calidad** → APU-05 análisis
cualitativo → APU-06 exportación académica). Este repositorio es
autocontenido: no depende de tener las otras unidades instaladas para correr
o probar, pero su formato de entrada es el `speakers.json` real que exporta
APU-03 (ver `docs/CONTRACTS.md`).

## Ejecutar la aplicación

```bash
npm install
npm start
```

Abrir `http://127.0.0.1:8080/` en el navegador. **No abrir `index.html` con
doble clic**: el navegador bloquea los módulos ES y el Web Worker bajo el
protocolo `file://`; `index.html` detecta ese caso y muestra instrucciones.

Flujo de uso (uno o varios archivos a la vez — Batch):
seleccionar uno o más `speakers.json` → configurar privacidad (opcional,
apagada por defecto) → revisar el Panel de calidad (APU-04D) →
abrir cada archivo en la Vista de Diálogo Continuo → aceptar/editar
segmentos → finalizar → descargar el paquete de 4 archivos por caso.

Ver `docs/MANUAL-USUARIO.md` para una guía paso a paso sin lenguaje técnico.

## Ejecutar las pruebas

```bash
npm test
```

189 pruebas con el runner nativo de Node (`node --test`), sin dependencias
de producción nuevas. `jsdom` es la única `devDependency`, usada solo para
probar el DOM de la interfaz.

## Estructura del repositorio

```text
index.html              Punto de entrada
src/main.js             Carga assets/data/*.json e inicia la app
src/core/               Lógica pura: validación, ingestión, pipeline de limpieza,
                         glosario, PII relacional, telemetría, vistas derivadas, batch
src/ui/                 Pantallas (DOM): ingestión, privacidad, dashboard, diálogo,
                         exportación
src/utils/               Utilidades puras: hash, diff de texto, listas, descarga
src/workers/             Web Worker que ejecuta el pipeline sin bloquear la UI
assets/data/            glossary.json y ner-patterns.json — editables sin tocar código
assets/styles/          Hoja de estilos (CSS puro, sin frameworks)
scripts/serve.mjs       Servidor estático local (solo módulos nativos de Node)
tests/                  Pruebas (node:test + jsdom) y fixtures realistas
docs/CONTRACTS.md       Formato de cada archivo de entrada/salida (fuente de verdad)
docs/DECISIONS.md       Decisiones de diseño no obvias — leer antes de tocar código
docs/AGENT-GUIDE.md     Reglas para agentes IA + guía puente hacia APU-05
docs/MANUAL-USUARIO.md  Guía no técnica para el investigador
docs/CURRENT-STATUS.md  Estado real del proyecto, bloque por bloque
```

## Principios de diseño (resumen; detalle en `docs/DECISIONS.md`)

1. 100% local: nada sale a internet. El único acceso a `fetch()` en todo
   `src/` es el Worker leyendo su propio código fuente (patrón Inline
   Worker), verificado por auditoría estática (`tests/apu04-static-audit.mjs`).
2. `originalText` es inmutable; `cleanedText` se congela tras la revisión
   humana final.
3. El enmascarado de PII es por reglas y listas (regex + diccionarios), no
   IA estadística — deliberado, no una limitación temporal. Apagado por
   defecto (opt-in); si se activa, el reemplazo es relacional e indexado
   (`[PERSONA_1]`, `[HOSPITAL_A]`).
4. Batch: uno o varios archivos a la vez, con Dashboard Transversal de
   Calidad (APU-04D) para auditar por excepción.
5. Covariables agnósticas: `speakers[]`, `covariateProject`,
   `covariateSchema` viajan intactos desde APU-03, sin formulario clínico
   fijo ni claves obligatorias.
6. Interfaz en español.

## Stack

Vanilla JS (ES2022+ Modules, sin transpilar), CSS puro, Web Worker, Web
Crypto API. Node.js ≥18 solo para correr pruebas y el servidor de desarrollo.

## Licencia

MIT — ver `LICENSE`.
