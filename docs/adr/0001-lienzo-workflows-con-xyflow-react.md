# ADR 0001 — Construir el lienzo de workflows con `@xyflow/react`

- **Estado:** aceptado (2026-09-25, spike con US-120; ver "Resultado del spike")
- **Fecha:** 2026-09-24
- **HU relacionadas:** US-120 a US-132 (`docs/epicas/editor-visual-workflows/`)
- **Condición de aprobación:** un spike técnico que se hace junto con US-120 (ver "Validación pendiente"; cumplida en "Resultado del spike")
- **Investigación:** `docs/investigacion/editor-visual-workflows.md`

## Contexto

El lienzo del borrador (`apps/web/src/app/dashboard/panels/application/workflow-canvas.tsx`)
está hecho a mano sobre `@dnd-kit/react` 0.5.0:

- Los nodos son `div` con posición absoluta.
- Las aristas se dibujan en un SVG que no recibe eventos del puntero.
- Los puertos tienen alturas fijas.
- No hay viewport.

La épica Editor visual de workflows pide zoom, desplazamiento, minimapa,
selección múltiple, conexiones arrastrando desde cualquier puerto, aristas
seleccionables y orden automático. Sobre la base actual habría que construir
todo eso a mano, incluida la transformación de coordenadas entre pantalla y
lienzo, que afecta a cada interacción de arrastre.

## Decisión

1. Usar **`@xyflow/react`** (React Flow 12, licencia MIT) como motor del lienzo:
   - Trae de fábrica viewport con zoom y desplazamiento, `MiniMap`, `Controls`, `Background`, `Handle` por puerto, selección por caja y múltiple, `snapToGrid`, `fitView`, `isValidConnection`, nodos y aristas personalizados, y `NodeToolbar`.
   - Requiere importar `@xyflow/react/dist/style.css` y se usa en un componente cliente; `workflow-canvas.tsx` ya declara `"use client"`.
2. Usar **`@dagrejs/dagre`** (licencia MIT) para `Ordenar nodos` (US-124), con un layout `LR` por niveles del DAG.
3. Los nodos y aristas de React Flow se **derivan** del `draft` del servidor; no son una segunda fuente de verdad.
   - Hoy las aristas se derivan en dos lugares con código distinto: `workflowCanvasEdges` en la web (`workflow-canvas.tsx:109`) y `workflowEdges`, privada, en la validación del servidor (`workflow-validation.ts:42`). US-130 las unifica en una utilidad de dominio compartida, que el lienzo usará para construir las aristas de React Flow.
   - Las posiciones se siguen guardando en `draft.layout`.
4. Retirar `@dnd-kit/react` cuando el lienzo deje de usarlo. Hoy
   `workflow-canvas.tsx` es su único consumidor en `apps/web/src`.

## Alternativas consideradas

- **Seguir con `@dnd-kit/react` y un viewport propio.** No añade dependencias,
  pero exige implementar zoom, desplazamiento, minimapa, selección por caja,
  enrutamiento de aristas y detección de puertos. Es la opción de mayor costo y
  mayor riesgo de errores de coordenadas.
- **elkjs para el orden automático.** Tiene más opciones de layout (puertos,
  particiones), pero pesa más y los DAG de Ayni son pequeños y por niveles;
  dagre basta. Se puede revisar si aparecen grupos o subflujos.

## Consecuencias

- Se agregan dos dependencias a `apps/web`. Las versiones exactas se fijan al
  implementar, consultando el registro: el 2026-09-24 eran `@xyflow/react`
  12.12.0 (peer `react >= 17`) y `@dagrejs/dagre` 3.1.1. La web usa
  `react` 19.2.8.
- `@xyflow/react` 12.12.0 depende de `zustand ^4.4.0`, mientras que la web usa
  `zustand ^5.0.15`. Convivirán dos versiones, una de ellas anidada; hay que
  confirmarlo en `bun.lock` y medir el impacto en el bundle al implementar.
- Hay que conservar los nombres accesibles y los `data-testid` que usan las
  pruebas actuales de US-028 a US-037, o migrar esas pruebas en el mismo cambio.
- jsdom no calcula dimensiones. Además del polyfill de `ResizeObserver` que ya
  existe en `apps/web/src/test-setup.ts`, las pruebas de componentes necesitarán
  simular `DOMRect`, las medidas de los nodos, los eventos de puntero y
  `matchMedia`. La lógica de grafo, orden y compatibilidad debe vivir en
  funciones puras, que se prueban sin DOM.
- React Flow resuelve la interacción visual, pero no la semántica del dominio:
  aristas implícitas, cardinalidad de entradas y edición simultánea siguen
  siendo responsabilidad del servidor (US-130 y US-131).
- El estilo de React Flow se ajusta a los tokens de `apps/web/DESIGN.md`
  mediante sus variables CSS y clases; no se usa su tema por defecto.

## Validación pendiente (spike con US-120)

El ADR pasa a **aceptado** solo si el spike demuestra lo siguiente:

1. Instalar versiones exactas de `@xyflow/react` y `@dagrejs/dagre` y
   registrarlas en `bun.lock`.
2. Ver cómo quedan las dos versiones de zustand en `bun.lock`.
3. Hacer `build` de producción de `apps/web` con Next 16, incluida la
   importación de `@xyflow/react/dist/style.css`.
4. Medir el tamaño del bundle de la ruta del workflow antes y después.
5. Pasar la suite de `application-detail-panel.test.tsx` sin regresiones,
   conservando `Lienzo del workflow`, `Salida <puerto>`,
   `Conectar entrada de imagen de …` y `data-testid="workflow-node-<id>"`.
6. Hacer funcionar en jsdom una interacción mínima (seleccionar y mover un nodo).

Si alguno falla, se reevalúa la alternativa de seguir con `@dnd-kit/react`.

## Resultado del spike (2026-09-25, US-120)

Los seis puntos se cumplen, así que el ADR pasa a **aceptado**.

1. **Versiones.** `apps/web/package.json` fija `@xyflow/react` 12.12.0 y
   `@dagrejs/dagre` 3.1.1, y `bun.lock` las registra. `@dnd-kit/react` se
   retiró, porque el lienzo era su único consumidor.
2. **zustand.** `bun.lock` anida `zustand@4.5.7` en `@xyflow/react/zustand`, y
   la web sigue con zustand 5.
3. **Build.** `next build` (Next 16.3.5, Turbopack) compila sin errores con
   `@xyflow/react/dist/style.css` importado en `workflow-canvas.tsx`.
4. **Bundle.** Se midió la ruta `/dashboard/applications/[id]/workflows/[workflowId]`
   sumando los chunks de JS de sus manifiestos:
   - Antes: 1662.9 KB, o 490.6 KB con gzip.
   - Después: 1742.1 KB, o 515.5 KB con gzip.
   - Diferencia neta: +79.2 KB, o +24.9 KB con gzip, ya descontado el retiro de dnd-kit.
   - El CSS de React Flow sale en un chunk propio de 20.1 KB, o 3.6 KB con gzip.
5. **Pruebas.** `application-detail-panel.test.tsx` pasa sin regresiones
   (86/86) y conserva `Lienzo del workflow`, `Salida <puerto>`,
   `Conectar entrada de imagen de …` y `data-testid="workflow-node-<id>"`.
   - Para que los nodos sean visibles antes de medirse, se les da `initialWidth` e `initialHeight`, lo que evita tener que simular el DOM en esa suite.
6. **jsdom.** `workflow-canvas-navigation.test.tsx` mueve un nodo con el ratón
   a 50 % de zoom y comprueba la posición guardada, además del zoom, el ajuste a
   la vista y el minimapa.
   - Para lograrlo simula `ResizeObserver`, `DOMMatrixReadOnly`, `offsetWidth` y `offsetHeight`.
   - También fija `event.view` en los eventos de ratón, porque d3-drag lo necesita y el constructor de jsdom no lo acepta.

Decisiones de implementación en US-120:

- El zoom, el desplazamiento, el arrastre de nodos y las conexiones los maneja React Flow:
  - `minZoom` es 0.25 y `maxZoom` es 2.
  - El botón central o `Espacio` + arrastre desplazan el lienzo.
  - `Ctrl` + rueda y el pellizco del trackpad hacen zoom.
  - La rueda sola desplaza la página (`preventScrolling={false}`).
  - `nodeExtent` limita el arrastre a las coordenadas que acepta el servidor.
- Los controles y el minimapa del lienzo son componentes propios dentro de `Panel`:
  - `Controls` avanza de 1.2 en 1.2 y no permite centrar la entrada de imagen cuando los nodos no caben al 25 %.
  - `MiniMap` no se puede usar con teclado, y US-120 lo exige.
