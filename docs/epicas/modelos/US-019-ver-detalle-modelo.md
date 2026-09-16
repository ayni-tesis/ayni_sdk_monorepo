# US-019 — Ver el detalle de un modelo

**Épica:** Modelos

## Historia de usuario

Como miembro de un workspace, quiero consultar el detalle de un modelo para
conocer su runtime y las versiones que puedo configurar en un workflow.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Modelos` → selección de modelo.

### Elementos y texto visible

- Encabezado: nombre del modelo y etiqueta `TensorFlow Lite`.
- Resumen: `ID del modelo`, `Versiones` y última actualización.
- Pestaña principal: `Versiones`.

### Estados y mensajes

- Carga: `Cargando modelo…`.
- No encontrado o sin acceso: `No encontramos este modelo.`
- Error: `No pudimos cargar el modelo. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Consultar un modelo propio
  Given que pertenezco al workspace de un modelo
  When abro su detalle
  Then el sistema muestra su nombre, identificador y runtime
```

## Bad path

```gherkin
Scenario: Consultar un modelo ajeno
  Given que no pertenezco al workspace de un modelo
  When intento abrir su detalle
  Then el sistema rechaza la solicitud
  And no revela los datos del modelo
```

## Criterios de aceptación

- Solo los miembros del workspace pueden consultar modelos de sus aplicaciones.
- El detalle no expone el archivo ni una ubicación de descarga.
- Una solicitud no autorizada no revela la existencia del modelo.
