# US-010 — Registrar el último uso de una credencial SDK

**Épica:** Credenciales SDK

## Historia de usuario

Como administrador de un workspace, quiero conocer cuándo una credencial SDK
se usó por última vez para identificar integraciones activas o abandonadas.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Credenciales SDK`.

### Elementos y texto visible

- La tabla de credenciales incluye la columna `Último uso`.
- Si nunca se usó: `Sin uso registrado`.
- Si se usó: fecha y hora con ayuda `Última autenticación correcta del SDK`.

### Estados y mensajes

- Mientras se carga la tabla: `Cargando credenciales…`.
- No se muestra un evento de último uso para credenciales inválidas o revocadas.
- La vista no permite editar manualmente este dato.

## Happy path

```gherkin
Scenario: Sincronización autenticada correctamente
  Given que una credencial SDK activa realiza una sincronización válida
  When el servidor completa la autenticación
  Then el sistema actualiza la fecha y hora de último uso de la credencial
```

## Bad path

```gherkin
Scenario: Sincronización con credencial inválida
  Given que un SDK presenta una credencial inválida
  When intenta sincronizar
  Then el servidor rechaza la solicitud
  And no actualiza el último uso de ninguna credencial
```

```gherkin
Scenario: Sincronización con credencial revocada
  Given que un SDK presenta una credencial revocada
  When intenta sincronizar
  Then el servidor rechaza la solicitud
  And conserva el último uso registrado antes de la revocación
```

## Criterios de aceptación

- El último uso se actualiza únicamente después de una autenticación válida.
- La fecha de último uso se muestra como metadato al listar credenciales.
- Los intentos con credenciales inválidas o revocadas no alteran el registro.
- El registro no almacena el secreto de la credencial ni datos de entrada del usuario.
