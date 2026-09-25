# ADR 0001 — Construir el lienzo de workflows con `@xyflow/react`

- **Estado:** propuesto
- **Fecha:** 2026-09-24
- **HU relacionadas:** US-120 a US-132 (`docs/epicas/editor-visual-workflows/`)
- **Condición de aprobación:** un spike técnico que se hace junto con US-120 (ver "Validación pendiente")
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
