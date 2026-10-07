# Épica — Gestión de cuenta y acceso

La épica reúne los flujos de autenticación y las operaciones básicas de la cuenta personal de Ayni. Busca que cada persona pueda crear y usar su cuenta, consultar y actualizar su perfil, y recuperar el acceso sin confundir estos datos con la pertenencia o los permisos de un workspace.

## Estado actual y alcance

La autenticación está configurada con correo y contraseña en `packages/auth/src/index.ts`; el acceso o registro con GitHub todavía no está implementado. El formulario de registro (`apps/web/src/components/sign-up-form.tsx`) recoge nombre, correo y contraseña, y solicita aceptar los términos vigentes; el alta se bloquea tanto en la interfaz como en el servidor mientras no esté publicado el aviso de privacidad de Ayni. El inicio de sesión (`apps/web/src/components/sign-in-form.tsx`) también exige aceptar los términos vigentes. El encabezado activo del dashboard (`apps/web/src/app/dashboard/panels/workspace-header.tsx`) ofrece el menú de cuenta con consulta de perfil en modo solo lectura y cierre de sesión; `apps/web/src/components/user-menu.tsx` no está conectado al flujo actual.

La aceptación de términos se especifica en [US-152](../privacidad-proteccion-datos/US-152-aceptar-terminos-de-uso.md), y la publicación del aviso de privacidad que habilita el registro en [US-153](../privacidad-proteccion-datos/US-153-consultar-aviso-de-privacidad.md). Esta épica los referencia; no redefine sus requisitos legales. La verificación del correo, una pantalla de perfil, la edición del nombre, el cambio de contraseña y la recuperación de contraseña todavía no están disponibles como flujos de producto.

## Historias

| Historia | Resultado |
| --- | --- |
| [US-163](US-163-crear-cuenta-ayni.md) | Crear una cuenta personal de Ayni. |
| [US-164](US-164-iniciar-sesion.md) | Iniciar sesión con las credenciales de la cuenta. |
| [US-165](US-165-cerrar-sesion.md) | Cerrar la sesión actual de forma explícita. |
| [US-166](US-166-consultar-perfil.md) | Consultar los datos básicos del perfil propio. |
| [US-167](US-167-actualizar-nombre-perfil.md) | Actualizar el nombre del perfil propio. |
| [US-168](US-168-verificar-correo-electronico.md) | Verificar el correo mediante un enlace de un solo uso. |
| [US-169](US-169-cambiar-contrasena.md) | Cambiar la contraseña con una sesión iniciada. |
| [US-170](US-170-recuperar-contrasena-olvidada.md) | Recuperar el acceso con un enlace seguro de restablecimiento. |
| [US-171](US-171-autenticarse-con-github.md) | Iniciar sesión o crear una cuenta mediante GitHub. |

## Reglas y límites

- La aceptación de los términos vigentes sigue las reglas de US-152; registrarse o iniciar sesión no sustituye ni duplica esa aceptación.
- La creación de cuentas sigue condicionada a que el aviso de privacidad de Ayni esté publicado, como establece US-153.
- El perfil pertenece a la cuenta personal. No reemplaza la gestión de workspaces, miembros o roles descrita en US-114–119.
- US-168 agrega un estado visible de correo pendiente o verificado, pero la verificación no es un requisito para acceder al dashboard en el alcance de esta épica.
- El acceso GitHub de US-171 debe respetar la aceptación de términos y el aviso publicado para nuevas cuentas; solo solicita permisos de identidad/correo, nunca de repositorios.
- El cambio de correo electrónico, la eliminación de cuenta y la administración de sesiones/dispositivos quedan fuera de alcance y requerirían historias separadas.

