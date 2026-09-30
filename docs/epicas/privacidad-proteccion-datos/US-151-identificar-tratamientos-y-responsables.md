# US-151 — Identificar tratamientos y responsables por aplicación

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como administrador de una aplicación, quiero registrar qué datos personales
trata la aplicación, para qué, y quién responde por cada tratamiento, para
configurar avisos y atender solicitudes sin confundir mis responsabilidades con
las de Ayni.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Privacidad y datos` → `Mapa de tratamientos`.

### Elementos y texto visible

- Por finalidad: datos tratados, fuente, obligatoriedad, base aplicable,
  destinatarios o encargados, transferencias, conservación y canal de derechos.
- Selector de rol por flujo: `Responsable`, `Encargado` o `Por determinar`.
- Aviso: `Confirma estos datos con la persona responsable de privacidad antes
  de publicar el aviso.`
- Acción principal: `Guardar mapa de tratamientos`.

### Estados y mensajes

- Éxito: `Mapa de tratamientos guardado.`
- Error: `No pudimos guardar el mapa de tratamientos.`
- Vacío: `Aún no se han registrado tratamientos.`
- Sin permisos: miembros sin permisos administrativos no pueden editarlo.

## Happy path

```gherkin
Scenario: Documentar una finalidad de una aplicación
  Given que soy administrador de una aplicación activa
  When registro sus datos, finalidad, rol, destinatarios y conservación
  Then el mapa queda asociado a esa aplicación
  And puedo usarlo para preparar el aviso de privacidad
```

## Bad path

```gherkin
Scenario: Publicar con responsabilidades sin confirmar
  Given que un tratamiento tiene el rol "Por determinar"
  When intento publicar el aviso de privacidad
  Then el sistema indica qué tratamientos deben confirmarse
  And no presenta el mapa como una validación legal
```

## Criterios de aceptación

- Los tratamientos quedan separados por finalidad y aplicación.
- El sistema distingue los datos que Ayni trata para operar la plataforma de
  los datos que la aplicación cliente trata de sus usuarios.
- Un rol o base no confirmados se muestran como pendientes; el sistema no los
  infiere ni declara que el tratamiento cumple la ley.
- La aplicación no puede publicar un aviso que omita campos obligatorios de su
  mapa confirmado.
- Solo administradores y propietarios de la aplicación pueden editar el mapa.
- El alcance de los campos se contrasta con la Ley N.º 29733 y el D.S.
  N.º 016-2024-JUS, con revisión legal antes del lanzamiento.
