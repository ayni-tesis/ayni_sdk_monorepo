# US-011 — Regenerar una credencial SDK

**Épica:** Credenciales SDK

## Historia de usuario

Como administrador de un workspace, quiero regenerar una credencial SDK para
reemplazar un secreto comprometido sin cambiar la aplicación ni sus recursos.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Credenciales SDK` → fila activa → `Regenerar`.

### Elementos y texto visible

- Diálogo: `¿Regenerar esta credencial?`.
- Aviso: `La credencial actual se revocará inmediatamente. Actualiza la configuración de tu app con el nuevo secreto.`
- Acciones: `Regenerar credencial` y `Cancelar`.
- Tras éxito: `Copia la nueva credencial ahora. No podrás verla nuevamente.` con `Copiar credencial`.

### Estados y mensajes

- Carga: `Regenerando credencial…`.
- Éxito: `Nueva credencial generada. La anterior fue revocada.`
- Estado no activo: `Solo puedes regenerar credenciales activas.`
- Sin permisos: `No tienes permiso para regenerar credenciales.`

## Happy path

```gherkin
Scenario: Regenerar una credencial activa
  Given que soy administrador del workspace de una aplicación
  And la aplicación tiene una credencial SDK activa
  When confirmo que deseo regenerarla
  Then el sistema emite una nueva credencial para la misma aplicación
  And revoca la credencial anterior
  And muestra el nuevo secreto una sola vez
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento regenerar una credencial SDK
  Then el sistema rechaza la operación por falta de permisos
  And conserva la credencial activa anterior
```

```gherkin
Scenario: Regenerar una credencial ya revocada
  Given que una credencial SDK está revocada
  When intento regenerarla
  Then el sistema informa que la credencial no está activa
  And no crea una credencial nueva
```

## Criterios de aceptación

- Solo los administradores del workspace pueden regenerar credenciales.
- La nueva credencial queda vinculada a la misma aplicación.
- La credencial anterior queda revocada cuando la nueva se crea correctamente.
- El secreto nuevo se muestra una sola vez y no se almacena en texto plano.
- Regenerar no modifica workflows, modelos ni sus versiones.
