# US-008 — Listar las credenciales SDK de una aplicación

**Épica:** Credenciales SDK

## Historia de usuario

Como administrador de un workspace, quiero ver las credenciales de una
aplicación para administrar cuáles SDK pueden sincronizar sus recursos.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Credenciales SDK`.

### Elementos y texto visible

- Título: `Credenciales SDK`.
- Tabla: `Prefijo`, `Estado`, `Creada el` y `Último uso`.
- Acción visible para administradores: `Generar credencial`; cada fila activa incluye `Revocar` y `Regenerar`.
- Nunca se muestra una columna ni botón para revelar el secreto.

### Estados y mensajes

- Carga: `Cargando credenciales…`.
- Vacío: `Esta aplicación aún no tiene credenciales SDK.`
- Error: `No pudimos cargar las credenciales. Inténtalo nuevamente.`
- Sin permisos: `No tienes permiso para ver las credenciales de esta aplicación.`

## Happy path

```gherkin
Scenario: Aplicación con credenciales
  Given que soy administrador del workspace de una aplicación
  And la aplicación tiene credenciales SDK
  When consulto sus credenciales
  Then el sistema muestra el identificador, prefijo, estado y fecha de creación de cada una
  And no muestra ningún secreto
```

```gherkin
Scenario: Aplicación sin credenciales
  Given que soy administrador del workspace de una aplicación sin credenciales
  When consulto sus credenciales
  Then el sistema muestra un estado vacío
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento consultar las credenciales de una aplicación
  Then el sistema rechaza la solicitud por falta de permisos
  And no revela sus metadatos
```

```gherkin
Scenario: Consultar credenciales de una aplicación ajena
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus credenciales
  Then el sistema rechaza la solicitud
  And no revela si la aplicación tiene credenciales
```

## Criterios de aceptación

- Solo los administradores del workspace pueden listar credenciales SDK.
- La lista contiene metadatos operativos, nunca secretos reutilizables.
- Las credenciales se muestran únicamente para la aplicación solicitada.
- Una aplicación sin credenciales devuelve un estado vacío claro.
- Las solicitudes no autorizadas no revelan metadatos ni existencia de credenciales.
