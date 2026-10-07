# US-163 — Crear una cuenta de Ayni

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona interesada en Ayni, quiero crear una cuenta personal con mis datos y aceptar las condiciones vigentes para acceder a la plataforma.

## Interfaz

### Ubicación

Formulario de registro en `/sign-up`.

### Elementos y texto visible

- Campos `Nombre`, `Correo electrónico` y `Contraseña`.
- Enlace al aviso de privacidad de Ayni cuando la creación de cuentas está habilitada.
- Enlace a los términos vigentes y aceptación afirmativa antes de enviar el formulario.
- Acción `Crear cuenta` y enlace para ir a `Iniciar sesión`.

**Estado actual:** el formulario recoge nombre, correo y contraseña, pide aceptar los términos vigentes y muestra una declaración de mayoría de edad. El alta está bloqueada mientras el aviso de privacidad de Ayni no esté publicado. Véanse `apps/web/src/components/sign-up-form.tsx` y `packages/auth/src/index.ts`.

### Estados y mensajes

- Validación: se señalan los campos inválidos y la falta de aceptación de términos antes de enviar.
- Aviso sin publicar: `Registro temporalmente no disponible` y explicación de que el alta se habilitará al publicar el aviso completo.
- Correo ya registrado: `Ya existe una cuenta con este correo electrónico. Inicia sesión en su lugar.`
- Error de registro: se informa que no fue posible completar el registro, sin exponer credenciales.
- Éxito: se confirma la creación y se continúa al destino posterior a la autenticación.

## Happy path

```gherkin
Scenario: Crear una cuenta cuando el registro está habilitado
  Given que el aviso de privacidad de Ayni está publicado
  And consulté los términos vigentes y marqué su aceptación
  When envío un nombre, correo y contraseña válidos
  Then se crea mi cuenta personal
  And puedo continuar al destino posterior a la autenticación
```

## Bad path

```gherkin
Scenario: Impedir el registro si faltan condiciones obligatorias
  Given que el registro requiere el aviso publicado y aceptar los términos vigentes
  When intento crear una cuenta sin que se cumplan esas condiciones
  Then la cuenta no se crea
  And veo una explicación que corresponde a la condición pendiente
```

## Criterios de aceptación

- La cuenta se crea con nombre, correo y contraseña válidos; los errores de validación se muestran junto al dato correspondiente.
- La interfaz y el servidor impiden crear la cuenta si el aviso de privacidad de Ayni no está publicado, conforme a US-153.
- El servidor valida la aceptación de la versión vigente de los términos conforme a US-152; no confía solamente en la validación del formulario.
- Un correo ya asociado a una cuenta no crea una segunda cuenta y ofrece ir al inicio de sesión.
- El flujo distingue entre registro en curso, registro exitoso y error; no presenta el éxito hasta que el servidor confirma la creación.
- Crear una cuenta personal no concede por sí mismo un rol o pertenencia a un workspace.

