# ADR 0001 — Construir el lienzo de workflows con `@xyflow/react`

- **Estado:** propuesto
- **Fecha:** 2026-09-24
- **HU relacionadas:** US-120 a US-129 (`docs/epicas/editor-visual-workflows/`)
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
   - `workflowCanvasEdges` ya une las aristas explícitas con las implícitas y se reutiliza.
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
- jsdom no calcula dimensiones. Las pruebas de componentes necesitan el
  polyfill de `ResizeObserver` que ya existe en `apps/web/src/test-setup.ts`, y
  probablemente medidas simuladas de los nodos. Esto se valida con la primera
  HU (US-120).
- El estilo de React Flow se ajusta a los tokens de `apps/web/DESIGN.md`
  mediante sus variables CSS y clases; no se usa su tema por defecto.
