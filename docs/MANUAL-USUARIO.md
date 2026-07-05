# APU-04 — Manual del investigador

Guía práctica para usar APU-04, sin lenguaje técnico. Si es la primera vez
que usa el sistema, lea las secciones 1 a 4 en orden.

## 1. ¿Qué hace APU-04?

Limpia y corrige el texto de sus entrevistas transcritas, revisa la calidad
de la transcripción, y —si usted lo decide— oculta nombres y otros datos
identificables. Todo ocurre en su computadora; nada se envía a internet.

## 2. Antes de empezar

Necesita el archivo `speakers.json` que generó la etapa anterior (APU-03).
Puede cargar uno solo o varios a la vez (por ejemplo, todas las entrevistas
de un estudio).

Abra la aplicación siempre con `npm start` y luego en el navegador:
`http://127.0.0.1:8080/`. No la abra haciendo doble clic en el archivo.

## 3. Paso a paso

### Paso 1 — Cargar archivos

Haga clic en la zona de carga y elija uno o varios archivos `speakers.json`.

### Paso 2 — Privacidad

Aparece una pregunta: **¿Activar el modo confidencial?**

- Si sus entrevistas **no** mencionan nombres, direcciones u otros datos que
  identifiquen personas, deje esto **apagado** (es la opción predeterminada)
  y continúe.
- Si sí necesita ocultar nombres, actívelo y escriba, uno por línea:
  - Nombres de personas a ocultar.
  - Nombres de hospitales o sitios a ocultar.
  - Direcciones a ocultar.

Cada mención de la misma persona en todo el documento recibirá siempre la
misma etiqueta (por ejemplo `[PERSONA_1]`), para que se entienda que es
siempre la misma persona sin revelar quién es.

**Importante:** este enmascarado funciona por listas que usted escribe, no
por inteligencia artificial que "adivina" nombres. Revise igualmente el
texto: puede haber menciones que las listas no capturaron.

### Paso 3 — Panel de calidad

Después de procesar, verá un resumen con:

- Cuántos archivos cargó y cuántos segmentos tienen en total.
- Palabras por minuto promedio, pausas largas, segmentos con posibles
  problemas.
- Una lista de archivos, con los que necesitan revisión marcados primero.
  Si un archivo no tiene nada que revisar, puede pasar de largo.

Haga clic en un archivo para revisarlo.

### Paso 4 — Revisar el texto (vista de diálogo)

Verá el texto de la entrevista como una conversación, segmento por segmento.

- Use la barra superior para filtrar: **Todos / Pendientes / Anómalos /
  Revisados**, elegir un hablante, o buscar una palabra.
- Por cada segmento puede:
  - **Aceptar**: el texto corregido automáticamente le parece correcto.
  - **Editar**: corregir el texto usted mismo.
- Segmentos marcados **ANÓMALO** (habla muy rápida, muy lenta, o pausas
  largas) conviene revisarlos con más atención.

**Atajos de teclado** (con un segmento seleccionado):

| Atajo | Acción |
|---|---|
| `Alt+A` | Aceptar el segmento sin cambios |
| `Alt+E` | Abrir el editor de texto del segmento |
| `Ctrl+Enter` | Guardar el texto mientras edita |
| `Alt+F` | Finalizar la revisión de este archivo |

No podrá finalizar hasta que todos los segmentos marcados como anómalos
hayan sido aceptados o editados al menos una vez.

### Paso 5 — Descargar los resultados

Al finalizar, descargue el paquete de archivos:

- **Archivo principal** (`..._cleaned.json`): guárdelo, es el que debe usar
  en el siguiente paso del análisis. Solo trae el texto ya revisado y los
  datos del estudio, sin registros internos.
- **Tabla** (`..._cleaned.csv`): para abrir en Excel u otro programa de
  hojas de cálculo.
- **Trazabilidad** (`..._trazabilidad.json`): el texto original, cada
  corrección aplicada y las métricas de calidad de cada segmento. Es un
  archivo de respaldo para auditar el trabajo si hace falta; no lo necesita
  para el análisis normal.
- **Reporte de calidad** (`..._quality_report.json`): para el apéndice
  metodológico de su estudio.
- **Bitácora de edición** (`..._edit_log.csv`): registro de qué se corrigió
  y cuándo.
- Si activó el modo confidencial: un archivo adicional con advertencia en
  rojo, que contiene el registro de qué se ocultó. **No comparta este
  archivo con nadie ni lo suba a ningún sistema en línea.**

Repita este paso para cada archivo del lote, volviendo al Panel de calidad.

## 4. Preguntas frecuentes

**¿Se pierden mis datos si cierro el navegador a mitad de la revisión?**
El progreso se guarda automáticamente en su computadora mientras trabaja.

**¿Puedo cambiar el texto después de finalizar?**
No directamente: una vez finalizado, el texto queda protegido para
garantizar que el archivo exportado no cambie después de auditarlo. Si
necesita corregir algo, deberá generar una nueva versión repitiendo el
proceso desde el archivo original.

**¿Qué pasa si mi archivo no tiene variables de estudio (VarOps)?**
Nada especial: la aplicación funciona igual, simplemente no mostrará
columnas de variables adicionales en la tabla exportada.

**¿Necesito completar un formulario con edad, sexo, diagnóstico, etc.?**
No. Esas variables —si su estudio las usa— ya vienen incluidas
automáticamente desde la etapa anterior (APU-03); no hay ningún formulario
que llenar aquí.
