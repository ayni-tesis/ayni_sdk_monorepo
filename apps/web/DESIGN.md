---
name: Ayni
description: Plataforma offline-first para orquestar modelos on-device.
colors:
  ink: "rgb(16 17 20)"
  surface: "rgb(16 25 35)"
  surface-raised: "rgb(32 50 70)"
  cyan: "rgb(54 182 201)"
  cyan-bright: "rgb(94 196 212)"
  text: "rgb(238 242 247)"
  text-muted: "rgb(113 122 142)"
  border: "rgb(32 50 70)"
  light-background: "rgb(238 242 247)"
  light-surface: "#FFFFFF"
  light-text: "#10272F"
  destructive: "#E75C62"
typography:
  display:
    fontFamily: "Geist, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.15
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "32px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "32px"
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Ayni

## Overview

**Creative North Star: "La malla de señales"**

Ayni se siente como un centro de control moderno para flujos de inteligencia on-device: oscuro, silencioso y competente. El azul petróleo sostiene largas sesiones de trabajo; el cian eléctrico marca decisiones, conexiones y progreso, nunca decoración indiscriminada.

La interfaz equilibra precisión técnica con orientación puntual. La ejecución de workflows y DAGs mantiene una densidad útil, mientras que las ayudas aparecen cerca de decisiones irreversibles, configuraciones nuevas y fallos accionables. Las superficies se separan mediante capas suaves, no mediante adornos futuristas.

**Key Characteristics:**

- Oscuro por defecto; claro como alternativa equivalente.
- Cian reservado para acción, foco y estado activo.
- Paneles sobrios con una elevación discreta.
- Información técnica legible, con guía contextual cuando aporta valor.

## Colors

Una base azul petróleo hace que los datos y los estados del workflow se lean durante horas; el cian comunica control activo y no una estética de neón.

### Primary

- **Cian de señal:** acción primaria, foco del teclado, conexión seleccionada y progreso confirmado.
- **Cian de pulso:** realce breve para hover, selección o énfasis de datos; no sustituye al texto.

### Secondary

- **Petróleo elevado:** capas secundarias, controles no primarios y agrupaciones del canvas.

### Neutral

- **Tinta profunda:** fondo oscuro por defecto y base de la aplicación.
- **Superficie de consola:** paneles, tablas y contenedores de trabajo.
- **Texto de niebla:** contenido principal sobre oscuro.
- **Niebla técnica:** etiquetas, metadatos y texto auxiliar.
- **Borde de marea:** separación discreta entre regiones y controles.
- **Papel frío:** fondo del tema claro alternativo.

### Named Rules

**The Signal Reserve Rule.** El cian se usa para acciones, foco, selección y estados positivos; la estructura visual la sostienen las superficies petróleo y los neutrales.

## Typography

**Display Font:** Geist (con `sans-serif` como respaldo)
**Body Font:** Geist (con `sans-serif` como respaldo)
**Label/Mono Font:** Geist Mono para IDs, hashes, versiones, logs y valores técnicos.

**Character:** Una sans contemporánea y compacta mantiene legible el trabajo técnico; el monoespaciado aparece solo donde refuerza trazabilidad o exactitud.

### Hierarchy

- **Display** (600, `clamp(1.75rem, 3vw, 2.5rem)`, 1.15): título de página y decisiones de alto nivel.
- **Headline** (600, 1.25rem, 1.3): título de panel, workflow o sección.
- **Body** (400, 0.875rem, 1.5): explicaciones, tablas y contenido de trabajo.
- **Label** (600, 0.75rem, 1.25, `0.02em`): metadatos, controles y estados; sin mayúsculas forzadas.

### Named Rules

**The Traceability Rule.** Versiones, hashes, identificadores y logs usan Geist Mono; el resto conserva la lectura humana de Geist.

## Layout

La densidad es equilibrada: cada pantalla prioriza el trabajo real sin convertirse en un muro de controles. Usa una barra lateral estable, área principal flexible y panel de contexto colapsable cuando haya inspección o ayuda. El ritmo usa 8px como unidad; 16px separa grupos, 24px secciones y 32px cambios de contexto.

En móvil y anchuras reducidas, el canvas conserva su prioridad; navegación, inspector y ayuda se contraen a paneles invocables. No se ocultan estados críticos de sincronización, ejecución ni error.

## Elevation & Depth

La profundidad es tonal y suave: el fondo de tinta contiene superficies petróleo y los paneles elevados se distinguen por tono, borde fino y una sombra ambiental mínima. No hay tarjetas flotantes por defecto.

### Shadow Vocabulary

- **Elevación contextual** (`0 8px 24px rgba(0, 0, 0, 0.18)`): inspector abierto, menú y diálogo; nunca para cada bloque de contenido.

### Named Rules

**The Working Surface Rule.** Una superficie elevada debe comunicar un cambio de contexto, no ser el envoltorio automático de cada dato.

## Shapes

Las formas son suavemente técnicas: controles de 6px, paneles de 10px y contenedores especiales de 14px. Los bordes son finos y de bajo contraste; las conexiones del DAG, no las esquinas exageradas, aportan expresividad.

## Components

### Buttons

- **Character:** directos y medidos, nunca llamativos sin razón.
- **Shape:** esquina sutil (6px).
- **Primary:** cian de señal con texto tinta, 32px de alto y padding de 8px × 12px.
- **Hover / Focus:** aumenta levemente el brillo del cian y conserva un anillo de foco claramente visible.
- **Secondary / Ghost:** superficie elevada o transparente; reservar el borde para acciones de menor jerarquía.

### Cards / Containers

- **Corner Style:** suavemente redondeado (10px).
- **Background:** superficie de consola; las regiones activas pueden usar petróleo elevado.
- **Shadow Strategy:** sin sombra en reposo; elevación contextual únicamente.
- **Border:** borde de marea de 1px.
- **Internal Padding:** 16px como valor normal.

### Inputs / Fields

- **Style:** superficie de consola, borde de marea y esquina de 6px.
- **Focus:** anillo cian y borde cian de señal; el foco no depende solo del color.
- **Error / Disabled:** error con rojo semántico más texto o icono; deshabilitado reduce contraste sin ocultar el contenido.

### Navigation

- **Style:** sobria y persistente; el destino activo se marca con una capa petróleo elevada y un indicador cian.
- **States:** hover tonal, activo con indicador y foco visible.
- **Mobile:** navegación e inspector se convierten en paneles invocables, sin perder el estado de sincronización.

## Do's and Don'ts

### Do:

- **Do** reservar el cian para acción, foco, selección y progreso.
- **Do** mostrar ayuda contextual junto a decisiones complejas, errores y primeras configuraciones.
- **Do** mantener datos técnicos compactos pero legibles, con jerarquía y espacios de 8px.
- **Do** acompañar cada estado de color con texto, icono o dirección comprensible.

### Don't:

- **Don't** reutilizar la paleta verde ni la estética de plantilla de shadcn como identidad de Ayni.
- **Don't** usar violeta/índigo genérico, gradientes decorativos o neón como sustituto de jerarquía.
- **Don't** envolver cada dato en una tarjeta elevada.
- **Don't** esconder estados críticos de offline, sincronización, modelo o ejecución en ayuda secundaria.
