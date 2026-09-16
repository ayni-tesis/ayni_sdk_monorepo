# US-009 — Revocar una credencial SDK

**Épica:** Credenciales SDK

## Historia de usuario

Como administrador de un workspace, quiero revocar una credencial SDK para
impedir que una integración comprometida o retirada vuelva a sincronizar
recursos de la aplicación.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Credenciales SDK` → fila de credencial → `Revocar`.

### Elementos y texto visible

- Diálogo: `¿Revocar esta credencial?`.
- Aviso: `Los SDK que la usan no podrán sincronizar recursos nuevos. Esta acción no elimina recursos ya guardados offline.`
- Acciones: `Revocar credencial` y `Cancelar`.

### Estados y mensajes

- Carga: `Revocando credencial…`.
- Éxito: `Credencial revocada.`; la fila cambia a estado `Revocada` y no ofrece `Revocar` otra vez.
- Sin permisos: `No tienes permiso para revocar credenciales.`
- SDK al usarla: `La credencial fue revocada. Genera una nueva credencial para continuar.`

## Happy path

```gherkin
Scenario: Revocar una credencial activa
  Given que soy administrador del workspace de una aplicación
  And la aplicación tiene una credencial SDK activa
  When confirmo la revocación de esa credencial
  Then el sistema cambia su estado a revocada
  And rechaza toda sincronización futura realizada con ella
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento revocar una credencial SDK
  Then el sistema rechaza la operación por falta de permisos
  And la credencial conserva su estado
```

```gherkin
Scenario: Usar una credencial revocada
  Given que una credencial SDK fue revocada
  When un SDK intenta sincronizar usando esa credencial
  Then el servidor rechaza la solicitud con el estado credentialRevoked
  And no entrega recursos de la aplicación
```

## Criterios de aceptación

- Solo los administradores del workspace pueden revocar credenciales.
- Una credencial revocada no puede autenticarse ni sincronizar recursos nuevos.
- La revocación se refleja al listar las credenciales de la aplicación.
- La revocación no elimina workflows, modelos ni versiones existentes.
- Los recursos ya almacenados en dispositivos sin conexión no pueden retirarse
  retroactivamente mediante la revocación.
