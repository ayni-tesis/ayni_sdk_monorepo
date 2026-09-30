# US-152 — Aceptar los términos y condiciones de Ayni

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona que crea una cuenta en Ayni, quiero revisar y aceptar los términos
y condiciones vigentes para saber qué condiciones rigen el uso de la plataforma.

## Interfaz

### Ubicación

Registro de cuenta y, cuando corresponda, siguiente inicio de sesión tras un
cambio material de los términos.

### Elementos y texto visible

- Enlace `Términos y condiciones` que abre el documento completo y su versión.
- Casilla inicialmente desmarcada: `Acepto los Términos y condiciones de Ayni`.
- Acción principal: `Crear cuenta` o `Aceptar términos`, según el estado.
- La casilla no incluye el consentimiento para finalidades de tratamiento.

### Estados y mensajes

- Casilla sin marcar: `Debes aceptar los Términos y condiciones para crear tu cuenta.`
- Éxito: `Términos aceptados.`
- Error: `No pudimos registrar tu aceptación. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Crear cuenta aceptando los términos y condiciones vigentes
  Given que revisé la versión vigente de los términos y condiciones
  When marco la casilla y creo mi cuenta
  Then la cuenta queda asociada a esa versión y a la fecha de aceptación
```

## Bad path

```gherkin
Scenario: Intentar crear una cuenta sin aceptar
  Given que no he marcado la casilla de términos
  When intento crear mi cuenta
  Then la cuenta no se crea
  And veo que debo aceptar los términos
```

## Criterios de aceptación

- La aceptación es una acción afirmativa separada del aviso de privacidad y de
  cualquier consentimiento opcional.
- El registro conserva como mínimo la cuenta, versión aceptada y fecha/hora.
- Una versión material nueva solicita aceptación antes de seguir usando las
  funciones cubiertas por los términos; la versión anterior queda en el
  historial.
- El rechazo impide crear la cuenta o continuar el uso sujeto al acuerdo, y no
  activa tratamientos opcionales.
- El registro no guarda credenciales ni datos personales innecesarios como
  evidencia de aceptación.
