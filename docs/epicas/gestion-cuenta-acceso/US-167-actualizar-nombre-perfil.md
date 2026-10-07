# US-167 — Actualizar el nombre de mi perfil

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una cuenta de Ayni, quiero actualizar el nombre de mi perfil para mantener correcta la información que la plataforma muestra sobre mí.

## Interfaz

### Ubicación

Vista de perfil de cuenta personal, desde la que se consulta el nombre actual y se guarda el cambio.

### Elementos y texto visible

- Campo editable `Nombre`.
- Acción `Guardar cambios` y confirmación del resultado.
- El correo se mantiene fuera del formulario editable en esta historia.

**Estado actual:** no se encontró un flujo dedicado para editar el perfil; el menú solo presenta el nombre y correo de la sesión. Esta historia está planificada y no describe una función ya disponible.

### Estados y mensajes

- Formulario inicial con el nombre actual.
- Guardado en curso: `Guardando cambios...`.
- Éxito: `Perfil actualizado.`
- Nombre inválido: se indica que debe corregirse sin reemplazar el dato guardado.
- Error de guardado: `No pudimos actualizar tu perfil. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Guardar un nuevo nombre en mi perfil
  Given que inicié sesión y consulto mi perfil
  When reemplazo el nombre por un valor válido y guardo los cambios
  Then veo el nuevo nombre en mi perfil
  And el cambio queda asociado únicamente a mi cuenta
```

## Bad path

```gherkin
Scenario: No guardar un nombre inválido
  Given que inicié sesión y edito mi perfil
  When envío un nombre que no cumple la validación
  Then el nombre anterior se conserva
  And veo qué dato debo corregir
```

## Criterios de aceptación

- Una persona autenticada puede actualizar únicamente el nombre de su propia cuenta.
- El servidor valida el nombre y rechaza valores inválidos sin modificar el perfil.
- La actualización no cambia correo, credenciales, aceptación de términos ni datos o roles de workspace.
- La interfaz confirma el guardado solo tras la respuesta satisfactoria del servidor y mantiene el dato anterior si la operación falla.
- Esta historia no incluye cambiar el correo electrónico.

