# US-166 — Consultar mi perfil

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una cuenta de Ayni, quiero consultar los datos básicos de mi perfil para reconocer qué información está asociada a mi cuenta.

## Interfaz

### Ubicación

Una vista de perfil de cuenta personal accesible desde el menú de usuario.

### Elementos y texto visible

- Nombre y correo electrónico de la cuenta autenticada.
- El correo se muestra solo para consulta dentro de esta historia.
- Estado de carga, perfil disponible o error al consultar.

**Estado actual:** el menú de usuario muestra el nombre y el correo de la sesión, pero no existe una vista dedicada de perfil. Véase `apps/web/src/components/user-menu.tsx`.

### Estados y mensajes

- Cargando perfil: se comunica que los datos están cargando.
- Perfil disponible: se muestran los datos de la cuenta autenticada.
- Sin sesión: se solicita iniciar sesión para consultar el perfil.
- Error: `No pudimos cargar tu perfil. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Consultar los datos de mi perfil
  Given que inicié sesión en Ayni
  When abro mi perfil
  Then veo el nombre y el correo asociados a mi cuenta
  And los datos corresponden a mi propia cuenta
```

## Bad path

```gherkin
Scenario: No consultar un perfil sin sesión
  Given que no tengo una sesión activa
  When intento abrir una vista protegida de perfil
  Then no se muestran datos personales de una cuenta
  And se me solicita iniciar sesión
```

## Criterios de aceptación

- Una persona autenticada puede consultar como mínimo su nombre y correo asociados a la cuenta.
- La vista obtiene los datos de la sesión autenticada; no permite elegir ni consultar el perfil de otra persona.
- El correo es de solo lectura en esta historia; su cambio queda fuera de alcance.
- La vista diferencia carga, resultado y error, y ofrece reintentar ante un fallo recuperable.
- La consulta del perfil no modifica datos ni permisos del workspace de la persona.

