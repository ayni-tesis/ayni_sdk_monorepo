# Investigación — Editor visual de workflows

Este documento respalda la épica **Editor visual de workflows** (US-120 a
US-129, `docs/epicas/editor-visual-workflows/`). Toma n8n como referencia de
interacción, compara el lienzo actual con esa referencia y fija las decisiones
visuales dentro del sistema de diseño de `apps/web/DESIGN.md`. La decisión de
librería se registra en `docs/adr/0001-lienzo-workflows-con-xyflow-react.md`.

Fecha de la investigación: 2026-09-24.

## 1. Referencia: el lienzo de n8n

Controles del lienzo documentados por n8n
([Keyboard shortcuts](https://docs.n8n.io/build/keyboard-shortcuts)):

| Grupo | Interacción en n8n |
| --- | --- |
| Mover el lienzo | `Ctrl`/`Cmd` + arrastre, `Espacio` + arrastre, botón central + arrastre, dos dedos en pantallas táctiles |
| Zoom | `+`/`=` acercar, `-`/`_` alejar, `0` restablecer, `1` ajustar a la vista, `Ctrl`/`Cmd` + rueda |
| Nodos | doble clic abre el detalle, `Ctrl`/`Cmd` + `A` selecciona todo, `Ctrl`/`Cmd` + `V` pega, `Shift` + `S` agrega una nota |
| Con selección | flechas para ir al nodo vecino, `Ctrl`/`Cmd` + `C`/`X` copiar o cortar, `D` desactivar, `Supr` eliminar, `Enter` abrir, `F2` renombrar, `P` fijar datos, `Shift` + flechas para seleccionar en una dirección, `Ctrl`/`Cmd` + `G` agrupar |
| Ordenar | `Tidy up workflow` acomoda los nodos automáticamente; figura entre las acciones del menú contextual del nodo ([Work with nodes](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes)) |

Patrones de interacción de n8n que se adoptan. Son patrones conocidos de su
editor; salvo los atajos y *Tidy up*, no se contrastaron uno por uno con su
documentación:

- Puertos visibles a los lados del nodo; se conecta arrastrando de una salida a una entrada.
- Botón `+` en una salida libre para agregar el siguiente paso ya conectado.
- Panel lateral para buscar y agregar nodos.
- Panel de detalle del nodo al hacer doble clic.
- Ordenar automáticamente de izquierda a derecha.
- Controles de zoom y ajuste en una esquina del lienzo.

Patrones que **no** se adoptan en esta épica: notas adhesivas, copiar y pegar,
duplicar, desactivar nodos, fijar datos, grupos y deshacer general. Los tres
primeros quedaron fuera del alcance de esta épica por decisión de priorización
(2026-09-24) y pueden proponerse como historias posteriores; los demás no tienen
equivalente en el modelo de Ayni.

Por qué el insertar sobre una arista de n8n se sustituyó por US-128: con los
tipos actuales (`isConditionSourceCompatible` e `isOutputSourceCompatible` en
`apps/server/src/workflow-store.ts:139-157`) casi ninguna arista admite un nodo
intermedio sin reconfigurar el destino. Entre imagen y modelo no cabe nada,
porque ningún nodo recibe y devuelve una imagen. Entre un modelo y su salida,
una condición obligaría a cambiar la salida a booleana. Agregar desde un puerto
de salida sí tiene casos reales hoy.

## 2. Estado actual y brechas

Lienzo actual en `apps/web/src/app/dashboard/panels/application/`:

| Aspecto | Hoy | Brecha | HU |
| --- | --- | --- | --- |
| Motor | `@dnd-kit/react` 0.5.0 (`workflow-canvas.tsx:3`); nodos `div` absolutos | Sin viewport | US-120 |
| Zoom y desplazamiento | No existen; contenedor con `overflow-auto` y fondo de puntos CSS (`workflow-canvas.tsx:532`) | Zoom, desplazamiento, minimapa y ajustar a la vista | US-120 |
| Mover nodos | Solo desde el asa `IconGripVertical`; un nodo por vez; el lienzo se bloquea mientras guarda (`savingPosition`, `workflow-detail-view.tsx:343`) | Arrastre por toda la tarjeta, cuadrícula, selección múltiple y guardado en lote | US-121 |
| Conectar | Solo imagen → modelo (`areWorkflowPortsCompatible`, `workflow-store.ts:122`); condición y salida fijan su origen en el formulario y no se puede cambiar | Puertos en todos los nodos y reasignación del origen | US-122 |
| Aristas | SVG con `pointer-events-none` (`workflow-canvas.tsx:538`); se eligen desde una fila de botones bajo el lienzo | Selección y eliminación sobre la arista | US-123 |
| Puertos | Alturas fijas 86/116/148 en `edgePath` (`workflow-canvas.tsx:507-518`) | Anclas calculadas por el puerto real | US-122 |
| Posición inicial | Rejilla de 3 columnas (`defaultWorkflowCanvasPosition`, `nextWorkflowCanvasPosition`, líneas 80 y 92) | Orden automático por niveles del DAG | US-124 |
| Tarjeta de nodo | 292 × 188 (`NODE_WIDTH`/`NODE_HEIGHT`, líneas 73-74), sin icono por tipo | Icono, resumen y estado de validación | US-125 |
| Errores de validación | Solo en la tabla `Errores de validación` | Indicador sobre cada nodo | US-125 |
| Editar configuración | No existe; hay que eliminar y volver a crear | Panel `Detalles del nodo` | US-126 |
| Agregar nodos | Sección `Nodos disponibles` con formularios y `<select>` nativos | Buscador por categorías | US-127 |
| Siguiente paso | No existe | `+` en la salida | US-128 |
| Teclado | No hay atajos | Mapa de atajos | US-129 |

## 3. Diseño visual

Todo se expresa con los tokens de `apps/web/DESIGN.md`: el cian solo para
acción, foco, selección y conexión seleccionada; petróleo elevado para las
capas del lienzo; radios de 6/10/14 px; ritmo de 8 px.

### 3.1 Disposición del editor

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Workflows / Clasificador de hojas          [Validar workflow] [Publicar] │
├──────────────────────────────────────────────────────────────────────────┤
│ [+ Agregar nodo] [Ordenar nodos] [Alinear a la cuadrícula]    [?]        │ ← barra del lienzo
├───────────────────────────────────────────────────────┬──────────────────┤
│  · · · · · · · · · · · · · · · · · · · · · · · · · ·  │ Detalles del nodo│
│  · ┌────────────┐     ┌──────────────┐     ┌───────┐  │ (Sheet derecho,  │
│  · │ Imagen     ●────▶● Modelo       ●────▶● Salida│  │  se abre con     │
│  · └────────────┘     └──────────────┘     └───────┘  │  doble clic)     │
│  · · · · · · · · · · · · · · · · · · · · · · · · · ·  │                  │
│ ┌──────────────┐                        ┌──────────┐  │                  │
│ │ − 100 % + ⤢  │                        │ minimapa │  │                  │
│ └──────────────┘                        └──────────┘  │                  │
└───────────────────────────────────────────────────────┴──────────────────┘
```

- Controles de zoom abajo a la izquierda y minimapa abajo a la derecha, sobre
  superficie de consola con borde de marea; sin sombra en reposo.
- El panel `Agregar nodo` se abre como Sheet desde la izquierda y
  `Detalles del nodo` desde la derecha, con la elevación contextual
  `0 8px 24px rgba(0, 0, 0, 0.18)`. Ambos reutilizan `components/ui/sheet.tsx`.
- En anchuras reducidas el lienzo conserva la prioridad y los paneles se
  superponen (DESIGN.md, Layout). Se cierran con `Esc` (decisión de esta
  épica, US-129).

### 3.2 Anatomía del nodo

```
        ┌─ acento del tipo (barra de 3 px, color por tipo)
┌───────┴──────────────────────────┐
│ [icono]  Modelo            [⚠ 2] │ ← tipo (label 12 px/600) + indicador de errores
│ Clasificador de hojas            │ ← nombre (body 14 px)
│ v1.2.0 · classification          │ ← Geist Mono, niebla técnica
├──────────────────────────────────┤
●  Entrada de imagen    Resultado  ● ← puertos con etiqueta; entrada izq., salida der.
└──────────────────────────────────┘
```

- Tamaño base de 240 px de ancho, con altura según el número de puertos. Es más
  compacto que los 292 × 188 actuales.
- Tarjeta: superficie de consola, borde de marea de 1 px y radio de 10 px.
- Seleccionado: borde de 2 px en cian de señal. El grosor también distingue la
  selección, no solo el color.
- Con errores: borde destructivo, icono `IconAlertTriangle` y número de errores;
  el mensaje aparece en un tooltip (`components/ui/tooltip.tsx`).
- Puertos: círculo de 10 px. Neutro en reposo; cian cuando es un destino
  compatible durante un arrastre; atenuado al 40 % cuando es incompatible.

Iconos por tipo (todos existen en `@tabler/icons-react` 3.46, ya instalado):

| Tipo | Etiqueta | Icono | Acento |
| --- | --- | --- | --- |
| `input.image` | Imagen de entrada | `IconPhoto` | borde de marea |
| `model.tflite` | Modelo | `IconCpu` | petróleo elevado |
| `condition` | Condición | `IconGitBranch` | niebla técnica |
| `output` | Salida | `IconFlag` | texto de niebla |

El acento acompaña al icono y al texto; nunca es la única señal. Ningún tipo usa
cian: por la *Signal Reserve Rule* de DESIGN.md, el cian queda solo para
selección, foco y destinos compatibles durante un arrastre.

### 3.3 Aristas

| Estado | Estilo |
| --- | --- |
| Normal | Curva Bézier de 1,5 px en borde de marea, con flecha al destino |
| Hover | 2,5 px y cursor de puntero; área de clic invisible de 16 px |
| Seleccionada | 2,5 px en cian de señal; `Eliminar conexión` en el punto medio |
| Vista previa al conectar | Punteada en cian de pulso |
| En un ciclo | Destructiva y punteada, junto con los nodos resaltados |
| Ramas de condición | Etiqueta `Verdadero` o `Falso` junto al origen |

### 3.4 Atajos

| Atajo | Acción | Administrador | Miembro |
| --- | --- | --- | --- |
| `Ctrl`/`Cmd` + rueda, `+`, `-` | Zoom | sí | sí |
| `1` / `0` | Ajustar a la vista / zoom 100 % | sí | sí |
| `Espacio` + arrastre | Mover el lienzo | sí | sí |
| Flechas | Nodo vecino | sí | sí |
| `Ctrl`/`Cmd` + `A` | Seleccionar todo | sí | sí |
| `Esc` | Cerrar panel o limpiar selección | sí | sí |
| `?` | `Atajos de teclado` | sí | sí |
| `Enter` | `Detalles del nodo` | sí | sí (solo lectura) |
| `Supr` / `Retroceso` | Eliminar selección | sí | no |
| `Tab` | `Agregar nodo` | sí | no |
| `Shift` + `Alt` + `T` | `Ordenar nodos` | sí | no |

Los atajos se desactivan con el foco en un campo, un menú o un diálogo.

### 3.5 Accesibilidad

- Toda acción de arrastre tiene una alternativa con clic o teclado. La conexión
  por clic ya existe (`Salida imagen` → `Conectar entrada de imagen de …`,
  `workflow-canvas.tsx:267` y `:331`); se generaliza a todos los puertos.
- Se conservan los nombres accesibles que usan las pruebas actuales
  (`application-detail-panel.test.tsx`): `Lienzo del workflow`,
  `Salida <puerto>` y `Conectar entrada de imagen de <modelo> · <versión>`,
  además de `data-testid="workflow-node-<id>"`.
- Cada estado de color va acompañado de texto, icono o grosor (DESIGN.md,
  Do's and Don'ts).

## 4. Brechas técnicas por HU

Lo que falta en el backend y en el modelo para implementar las HU. Todo es
compatible con el SDK: `layout` no se publica
(`apps/server/src/workflow-version-store.ts:74`) y las versiones publicadas no
cambian.

| Brecha | Detalle | HU |
| --- | --- | --- |
| Coordenadas negativas | `workflowPositionSchema` exige `x, y ≥ 0` (`apps/server/src/workflows.ts:54-57`); un lienzo infinito necesita aceptar negativos o normalizar al guardar | US-120, US-121 |
| Guardado en lote | Solo existe `PATCH …/nodes/:nodeId/position` (`workflows.ts:472`); hace falta una operación que guarde varias posiciones de forma atómica | US-121, US-124 |
| Reasignar origen | La condición guarda `sourceNodeId` (su puerto `result` es implícito) y la salida guarda `sourceNodeId` y `sourcePort`; no hay endpoint para cambiarlos | US-122, US-123 |
| Ciclos con aristas implícitas (defensa en profundidad) | `findWorkflowCycle` (`workflow-store.ts:159`) y `findWorkflowCycleNodeIds` (`workflow-detail-view.tsx:62`) solo recorren `connections`; la validación (`workflowEdges` en `workflow-validation.ts`) sí incluye las implícitas. Con los tipos actuales los niveles son estrictos (imagen → modelo → condición → salida) y no se puede cerrar un ciclo; se cubre con una prueba unitaria sobre un borrador armado a mano | US-122 |
| Editar un nodo | No existe un `PATCH` de configuración; debe reutilizar `isConditionSourceCompatible` e `isOutputSourceCompatible` | US-126 |
| Agregar y conectar a la vez | Las condiciones y salidas ya nacen conectadas; para imagen → modelo hace falta agregar el modelo y crear la conexión de forma atómica | US-128 |
| Eliminar varios nodos | `DELETE …/nodes/:nodeId` borra uno por vez; se necesita una operación en lote atómica | US-129 |
| Tipos duplicados | Los tipos de nodo se declaran en `workflow-store.ts` y en `workflow-canvas.tsx`, y el `$type` de `packages/db/src/schema/workflow.ts` solo tipa `input.image` | todas |
| Estado del editor | `workflow-detail-view.tsx` (1411 líneas) guarda todo en `useState`; la selección múltiple, el viewport y los paneles justifican un store o un reducer propio del editor | US-120 a US-129 |

## 5. Orden sugerido de implementación

1. ADR y base del lienzo con `@xyflow/react`, sin regresiones de las pruebas de
   US-028 a US-037, junto con US-120.
2. US-121 y US-124: guardado en lote de posiciones.
3. US-122 y US-123: reasignar el origen de condiciones y salidas.
4. US-125.
5. US-127, US-128 y US-126: buscador y panel de detalles.
6. US-129.

## Fuentes

- n8n, [Keyboard shortcuts](https://docs.n8n.io/build/keyboard-shortcuts).
- n8n, [Work with nodes](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes), acción `Tidy up workflow`.
- React Flow, [Quick start](https://reactflow.dev/learn) y [ejemplo con dagre](https://reactflow.dev/examples/layout/dagre).
- Registro de npm: `@xyflow/react` 12.12.0 y `@dagrejs/dagre` 3.1.1, consultados el 2026-09-24.
