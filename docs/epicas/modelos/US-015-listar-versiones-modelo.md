# US-015 — Listar las versiones de un modelo

**Épica:** Modelos

## Historia de usuario

Como miembro de un workspace, quiero ver las versiones de un modelo para poder
seleccionar una versión concreta al configurar un workflow.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Modelos` → modelo → `Versiones`.

### Elementos y texto visible

- Título: `Versiones de <modelo>`.
- Tabla: `Versión`, `Hash`, `Tamaño`, `Subida el` y `Contrato`.
- Para administradores: `Subir versión`; cada versión sin uso ofrece `Eliminar`.

### Estados y mensajes

- Carga: `Cargando versiones…`.
- Vacío: `Este modelo aún no tiene versiones.`
- El hash se muestra abreviado con acción `Copiar hash`.

## Happy path

```gherkin
Scenario: Modelo con versiones publicadas
  Given que pertenezco al workspace de un modelo con versiones
  When consulto sus versiones
  Then el sistema muestra el identificador, hash, tamaño y fecha de cada versión
```

```gherkin
Scenario: Modelo sin versiones
  Given que pertenezco al workspace de un modelo sin versiones
  When consulto sus versiones
  Then el sistema muestra un estado vacío
```

## Bad path

```gherkin
Scenario: Consultar versiones de un modelo ajeno
  Given que no pertenezco al workspace de un modelo
  When intento consultar sus versiones
  Then el sistema rechaza la solicitud
  And no revela si existen versiones
```

## Criterios de aceptación

- Los miembros del workspace pueden listar versiones de los modelos de sus aplicaciones.
- Cada versión muestra su identificador, hash de integridad, tamaño y fecha de carga.
- La respuesta no incluye el archivo del modelo ni una URL de descarga.
- Un modelo sin versiones devuelve un estado vacío claro.
- Una solicitud no autorizada no revela la existencia de versiones.
