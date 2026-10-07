# US-168 — Verificar mi correo electrónico

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una cuenta de Ayni, quiero verificar que puedo recibir mensajes en el correo asociado a mi cuenta para conocer el estado de esa dirección.

## Interfaz

### Ubicación

Estado del correo en el perfil de cuenta y enlace de verificación enviado a la dirección asociada.

### Elementos y texto visible

- Estado `Correo pendiente de verificación` o `Correo verificado`.
- Enlace de un solo uso para confirmar la dirección.
- Confirmación visible después de procesar un enlace válido.

**Estado actual:** no hay un flujo de verificación de correo disponible en la interfaz de cuenta ni en la configuración de Better Auth de `packages/auth/src/index.ts`. Esta historia está planificada.

### Estados y mensajes

- Pendiente: `Correo pendiente de verificación`.
- Verificado: `Correo verificado`.
- Enlace inválido, vencido o ya utilizado: `Este enlace ya no es válido. Solicita uno nuevo para verificar tu correo.`
- Error temporal: `No pudimos verificar tu correo. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Verificar el correo con un enlace vigente
  Given que mi cuenta muestra el correo pendiente de verificación
  And recibí el enlace de verificación para esa dirección
  When abro el enlace antes de que venza y todavía no fue utilizado
  Then el correo de mi cuenta queda verificado
  And veo el estado “Correo verificado”
```

## Bad path

```gherkin
Scenario: Rechazar un enlace que no puede verificarse
  Given que recibí un enlace de verificación
  When el enlace venció, ya fue utilizado o no es válido
  Then el correo no cambia a verificado
  And veo cómo solicitar un nuevo enlace
```

## Criterios de aceptación

- La cuenta muestra claramente si el correo está pendiente o verificado.
- La verificación requiere un token asociado a la cuenta y a la dirección pendiente, de un solo uso y con vencimiento.
- Solo un enlace válido y no utilizado puede cambiar el correo asociado a la cuenta a estado verificado.
- Un enlace inválido, vencido o reutilizado no modifica el estado y permite solicitar otro enlace.
- La solicitud y el resultado no exponen datos de otra cuenta.
- Tener el correo pendiente no bloquea el acceso al dashboard dentro del alcance de esta épica.

