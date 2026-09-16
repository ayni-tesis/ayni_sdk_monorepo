# US-014 — Listar los modelos de una aplicación

**Épica:** Modelos

## Historia de usuario

Como miembro de un workspace, quiero ver los modelos registrados en una
aplicación para identificar cuáles puedo usar en sus workflows.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Modelos`.

### Elementos y texto visible

- Título: `Modelos`.
- Cada fila muestra `Nombre`, `ID`, `Runtime` y `Versiones`.
- Para administradores: botón `Registrar modelo`.

### Estados y mensajes

- Carga: `Cargando modelos…`.
- Vacío: `Aún no hay modelos registrados en esta aplicación.`
- Error: `No pudimos cargar los modelos. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Aplicación con modelos registrados
  Given que pertenezco al workspace de una aplicación con modelos
  When consulto la lista de modelos
  Then el sistema muestra el nombre, identificador y runtime de cada modelo
```

```gherkin
Scenario: Aplicación sin modelos registrados
  Given que pertenezco al workspace de una aplicación sin modelos
  When consulto la lista de modelos
  Then el sistema muestra un estado vacío
```

## Bad path

```gherkin
Scenario: Consultar modelos de una aplicación ajena
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus modelos
  Then el sistema rechaza la solicitud
  And no revela si existen modelos
```

## Criterios de aceptación

- Los miembros del workspace pueden listar los modelos de sus aplicaciones.
- La lista contiene únicamente modelos de la aplicación solicitada.
- La lista muestra metadatos y no expone ni descarga los archivos `.tflite`.
- Una aplicación sin modelos devuelve un estado vacío claro.
- Una solicitud no autorizada no revela la existencia de modelos.
