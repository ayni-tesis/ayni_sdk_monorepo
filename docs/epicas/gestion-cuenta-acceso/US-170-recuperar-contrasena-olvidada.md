# US-170 — Recuperar una contraseña olvidada

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona que no puede iniciar sesión porque olvidó su contraseña, quiero solicitar un enlace seguro para recuperar el acceso a mi cuenta.

## Interfaz

### Ubicación

Enlace `¿Olvidaste tu contraseña?` desde `/sign-in` y formulario para solicitar el restablecimiento.

### Elementos y texto visible

- Campo `Correo electrónico`.
- Acción para solicitar el enlace de restablecimiento.
- Formulario para definir la nueva contraseña al abrir un enlace válido.
- Respuesta de solicitud genérica que no confirma si existe una cuenta.

**Estado actual:** no se encontró un flujo para solicitar o completar la recuperación de contraseña en el formulario de inicio de sesión ni en la configuración actual de Better Auth. Esta historia está planificada.

### Estados y mensajes

- Solicitud en curso: se comunica que se está procesando.
- Solicitud recibida: `Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.`
- Enlace inválido, vencido o usado: `Este enlace ya no es válido. Solicita recuperar tu contraseña nuevamente.`
- Error temporal: `No pudimos procesar la solicitud. Inténtalo nuevamente.`
- Restablecimiento exitoso: `Contraseña actualizada. Ya puedes iniciar sesión.`

## Happy path

```gherkin
Scenario: Restablecer una contraseña con un enlace vigente
  Given que no puedo iniciar sesión y tengo acceso al correo de mi cuenta
  When solicito recuperar la contraseña y abro el enlace vigente recibido
  And envío una nueva contraseña válida
  Then la contraseña de mi cuenta se actualiza
  And puedo iniciar sesión con la nueva contraseña
```

## Bad path

```gherkin
Scenario: No completar el restablecimiento con un enlace inválido
  Given que recibí un enlace de restablecimiento
  When el enlace venció, ya fue utilizado o no es válido
  Then la contraseña de la cuenta no cambia
  And se me indica solicitar un nuevo enlace
```

## Criterios de aceptación

- Una persona puede solicitar instrucciones de recuperación desde el inicio de sesión proporcionando un correo.
- La respuesta visible de la solicitud es la misma tanto si el correo corresponde a una cuenta como si no, para evitar enumeración de cuentas.
- El restablecimiento requiere un enlace/token asociado a la cuenta, de un solo uso y con vencimiento.
- El servidor valida el token y la nueva contraseña antes de cambiar la credencial.
- Un token inválido, vencido o ya usado no cambia la contraseña; la persona puede solicitar un nuevo enlace.
- Al completar el proceso, la contraseña nueva sirve para iniciar sesión y la anterior deja de ser válida.
- La historia no fija proveedor de correo ni duración del enlace.

