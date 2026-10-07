# US-169 — Cambiar mi contraseña con sesión iniciada

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una sesión iniciada, quiero cambiar mi contraseña verificando la actual para mantener el acceso a mi cuenta bajo mi control.

## Interfaz

### Ubicación

Acción de cambio de contraseña dentro de la vista de perfil o configuración de la cuenta.

### Elementos y texto visible

- Campos `Contraseña actual` y `Nueva contraseña`.
- Acción `Cambiar contraseña`.
- Confirmación del cambio o mensaje que permita corregir o reintentar.

**Estado actual:** Better Auth tiene habilitado el acceso mediante correo y contraseña, pero no se encontró un flujo de cambio de contraseña en la interfaz. Esta historia está planificada.

### Estados y mensajes

- Validación de contraseña actual y nueva antes de enviar.
- Cambio en curso: `Cambiando contraseña...`.
- Éxito: `Contraseña actualizada.`
- Contraseña actual incorrecta: `No pudimos verificar tu contraseña actual.`
- Error: `No pudimos cambiar tu contraseña. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Cambiar mi contraseña desde una sesión iniciada
  Given que inicié sesión en mi cuenta
  When envío mi contraseña actual correcta y una nueva contraseña válida
  Then la nueva contraseña queda asociada a mi cuenta
  And puedo usarla en un inicio de sesión posterior
```

## Bad path

```gherkin
Scenario: Rechazar un cambio con contraseña actual incorrecta
  Given que inicié sesión y abrí el cambio de contraseña
  When ingreso una contraseña actual incorrecta
  Then la contraseña de la cuenta no cambia
  And veo que no se pudo verificar la contraseña actual
```

## Criterios de aceptación

- Solo una persona autenticada puede iniciar el cambio de contraseña de su cuenta.
- El servidor verifica la contraseña actual antes de aceptar el cambio.
- La nueva contraseña debe cumplir la política vigente del sistema; las reglas se validan también en el servidor.
- Si la contraseña actual o la nueva no son válidas, la contraseña almacenada permanece sin cambios.
- Tras el éxito, la nueva contraseña puede usarse para iniciar sesión y la anterior deja de ser válida.
- Esta historia no administra sesiones activas en otros dispositivos.

