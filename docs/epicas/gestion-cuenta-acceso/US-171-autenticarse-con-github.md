# US-171 — Autenticarse o registrarse con GitHub

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona que usa GitHub, quiero iniciar sesión o crear mi cuenta de Ayni con esa identidad para acceder sin tener que usar una contraseña de Ayni.

## Interfaz

### Ubicación

Formularios de `/sign-in` y `/sign-up`.

### Elementos y texto visible

- Acción `Continuar con GitHub` en ambos formularios.
- Alternativa visible para continuar con correo y contraseña.
- Estado y resultado del flujo de autorización.

**Estado actual:** `packages/auth/src/index.ts` habilita correo y contraseña, pero no configura GitHub como proveedor. Los formularios actuales no ofrecen una acción de acceso mediante GitHub. Esta historia está planificada y no describe una función disponible.

### Estados y mensajes

- En curso: `Conectando con GitHub…`.
- Cancelación o fallo del proveedor: `No pudimos completar el acceso con GitHub. Inténtalo nuevamente o usa correo y contraseña.`
- Sin correo utilizable y confirmado: `GitHub no proporcionó un correo confirmado. Intenta con otra cuenta de GitHub o usa correo y contraseña.`
- Términos pendientes: se solicita aceptar los términos vigentes antes de completar el acceso, conforme a US-152.
- Aviso de Ayni sin publicar al crear una cuenta: se mantiene el estado de registro temporalmente no disponible de US-153.
- Identidad ya vinculada de forma incompatible: se muestra un error genérico que no revela correo ni datos de otra cuenta.

## Happy path

```gherkin
Scenario: Iniciar sesión con una identidad GitHub ya vinculada
  Given que estoy en /sign-in y mi identidad de GitHub ya está vinculada a mi cuenta Ayni
  And GitHub proporciona un correo utilizable y confirmado
  When continúo con GitHub y la autorización termina correctamente
  Then inicio sesión en la misma cuenta Ayni vinculada
  And continúo al destino posterior a la autenticación
```

```gherkin
Scenario: Vincular una identidad GitHub nueva a una cuenta con el mismo correo confirmado
  Given que existe una cuenta Ayni con un correo confirmado
  And inicio el acceso con una identidad GitHub aún no vinculada que confirma el mismo correo utilizable
  When continúo con GitHub y la autorización termina correctamente
  Then la identidad GitHub se vincula a esa misma cuenta Ayni
  And no se crea una cuenta duplicada
```

```gherkin
Scenario: Aceptar términos vigentes al iniciar sesión cuando sea necesario
  Given que estoy en /sign-in con una identidad GitHub vinculada
  And mi cuenta debe aceptar la versión vigente de los términos
  When continúo con GitHub y la autorización termina correctamente
  Then sigo el flujo de aceptación definido en US-152
  And no accedo a las rutas protegidas hasta completar ese requisito
```

```gherkin
Scenario: Crear una cuenta nueva con GitHub
  Given que estoy en /sign-up y el aviso de privacidad de Ayni está publicado
  And acepto los términos vigentes y autorizo el acceso mínimo solicitado
  And GitHub proporciona un correo utilizable y confirmado que no está asociado a otra cuenta
  When continúo con GitHub y la autorización termina correctamente
  Then se crea una cuenta Ayni asociada a esa identidad GitHub
  And continúo al destino posterior a la autenticación
```

## Bad path

```gherkin
Scenario: No crear una cuenta ni una sesión sin un correo confirmado
  Given que inicio el acceso mediante GitHub
  When GitHub no proporciona un correo utilizable y confirmado
  Then no se crea una cuenta ni se inicia una sesión
  And veo una alternativa para usar correo y contraseña o elegir otra cuenta GitHub
```

```gherkin
Scenario: No vincular identidades cuando la coincidencia de correo no es verificable
  Given que existe una cuenta Ayni y una identidad GitHub con el mismo correo
  When GitHub o la cuenta Ayni no confirma que su correo pertenece a esa persona
  Then la identidad no se vincula a esa cuenta
  And no se inicia sesión en esa cuenta por esa coincidencia
  And permanece visible la alternativa de acceso existente con correo y contraseña
```

## Criterios de aceptación

- `/sign-in` y `/sign-up` ofrecen `Continuar con GitHub` y mantienen disponible la alternativa con correo y contraseña.
- Una identidad GitHub ya vinculada vuelve a la misma cuenta Ayni en cada acceso y no crea cuentas ni vínculos duplicados.
- Si una identidad GitHub nueva y una cuenta Ayni existente confirman el mismo correo utilizable, se vincula a esa cuenta y no se crea una cuenta duplicada.
- Una identidad nueva solo puede crear una cuenta si GitHub proporciona un correo utilizable y confirmado.
- Si GitHub no proporciona correo utilizable y confirmado, no se crea cuenta ni sesión; se muestra una alternativa de acceso.
- Si el correo de GitHub o el de la cuenta Ayni no está confirmado, una coincidencia no vincula la identidad ni autoriza el inicio de sesión en la cuenta existente; la alternativa de correo y contraseña permanece visible.
- Si una identidad GitHub ya está asociada a otra cuenta Ayni, la operación se rechaza de forma segura y el mensaje no revela correo, existencia ni datos de esa cuenta.
- Al crear una cuenta, la interfaz y el servidor requieren los términos vigentes conforme a [US-152](../privacidad-proteccion-datos/US-152-aceptar-terminos-de-uso.md) y que el aviso de privacidad de Ayni esté publicado conforme a [US-153](../privacidad-proteccion-datos/US-153-consultar-aviso-de-privacidad.md). El acceso social no puede saltarse esos controles.
- Al iniciar sesión, si la cuenta debe aceptar una versión vigente de los términos, el acceso a rutas protegidas queda condicionado a completar el flujo de [US-152](../privacidad-proteccion-datos/US-152-aceptar-terminos-de-uso.md); OAuth no lo omite.
- La autorización solicita solo los permisos necesarios para identificar a la persona y obtener su correo; nunca solicita acceso a repositorios.
- Si la persona cancela la autorización o el proveedor devuelve un error, no se crea una sesión y puede reintentar o elegir correo y contraseña.

