# US-164 — Iniciar sesión

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una cuenta de Ayni, quiero iniciar sesión con mis credenciales para continuar usando la plataforma.

## Interfaz

### Ubicación

Formulario de inicio de sesión en `/sign-in`, accesible desde las páginas públicas y el menú de usuario cuando no hay sesión.

### Elementos y texto visible

- Campos `Correo electrónico` y `Contraseña`.
- Enlace a la versión vigente de los términos y casilla de aceptación cuando corresponde.
- Acción `Iniciar sesión` y acceso para ir al registro.

**Estado actual:** el formulario usa correo y contraseña, solicita aceptar los términos vigentes y redirige tras iniciar sesión correctamente. El servidor vuelve a validar esa aceptación. Véanse `apps/web/src/components/sign-in-form.tsx` y `packages/auth/src/index.ts`.

### Estados y mensajes

- Validación de correo, contraseña y aceptación de términos antes de enviar.
- En curso: `Iniciando sesión...`.
- Error de autenticación: `No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.`
- Éxito: la persona continúa al destino posterior a la autenticación.

## Happy path

```gherkin
Scenario: Iniciar sesión con credenciales válidas
  Given que tengo una cuenta de Ayni
  And acepté los términos vigentes que me solicita el flujo
  When envío el correo y la contraseña correctos
  Then se inicia mi sesión
  And continúo al destino posterior a la autenticación
```

## Bad path

```gherkin
Scenario: Rechazar credenciales inválidas
  Given que estoy en el formulario de inicio de sesión
  When envío credenciales inválidas o no cumplo la aceptación requerida
  Then no se inicia una sesión nueva
  And veo un mensaje que me permite corregir los datos o intentarlo de nuevo
```

## Criterios de aceptación

- El inicio de sesión autentica la cuenta mediante correo y contraseña.
- Si corresponde aceptar los términos vigentes, el formulario y el servidor requieren esa aceptación conforme a US-152.
- Un error no revela si el correo está registrado ni si solo la contraseña es incorrecta.
- Mientras la autenticación está en curso, la acción evita envíos duplicados y comunica el estado.
- Solo después de una autenticación confirmada se crea/actualiza la sesión y se aplica el destino posterior al inicio de sesión.

