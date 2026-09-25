# US-133 — Presentar Ayni a desarrolladores

**Épica:** Página inicial para desarrolladores

## Historia de usuario

Como desarrollador que visita Ayni, quiero entender qué problema resuelve y cómo fluye un workflow hasta el dispositivo para decidir si la plataforma se ajusta a mi aplicación.

## Interfaz

### Ubicación

Página pública raíz: `/`.

### Elementos y texto visible

- Marca enlazada a `/`.
- Título: `Workflows que siguen funcionando sin conexión.`
- Descripción: explica que se diseñan workflows versionados en Ayni y se ejecutan desde una app Flutter, incluso sin conexión.
- Sección `Cómo funciona`: tres etapas: diseñar el flujo, publicar una versión y ejecutar en el dispositivo.
- La explicación debe precisar que el dashboard publica workflows tipados y versionados y el dispositivo ejecuta la versión local; no se distribuye código arbitrario.

**Estado actual:** la implementación contiene esta estructura, pero los textos visibles están en inglés. Los textos españoles anteriores son el requisito objetivo y la localización sigue pendiente.

### Estados y mensajes

- La presentación es estática; no hay estados de carga, error ni permisos asociados.

## Happy path

```gherkin
Scenario: Entender el recorrido de un workflow
  Given que un desarrollador abre la página raíz
  When lee la introducción y la sección de etapas
  Then entiende que configura y versiona un workflow en el dashboard
  And entiende que la aplicación Flutter puede ejecutarlo localmente sin conexión
```

## Bad path

```gherkin
Scenario: Evitar promesas falsas sobre ejecución
  Given que un desarrollador consulta la página inicial
  When lee la explicación del producto
  Then la página no afirma que el dashboard ejecuta inferencias
  And no afirma que se envíe código arbitrario al dispositivo
```

## Criterios de aceptación

- La ruta `/` explica Ayni para desarrolladores en español.
- El contenido describe diseño, versionado y ejecución local offline como etapas diferenciadas.
- No se inventan métricas, clientes, testimonios ni capacidades ajenas al producto.
- La estructura sigue accesible y adaptable a pantallas móviles.
