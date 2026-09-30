# US-153 — Consultar el aviso de privacidad antes de la recopilación

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de Ayni o de una aplicación integrada con el SDK, quiero
conocer quién trata mis datos, qué datos usa y con qué finalidad antes de
entregarlos, para decidir con información clara.

## Interfaz

### Ubicación

En el registro de una cuenta Ayni y, para una aplicación cliente, antes del
primer tratamiento que requiera informar a la persona; acceso posterior desde
`Privacidad`.

### Elementos y texto visible

- Aviso legible que identifica al responsable y, cuando corresponda, al
  encargado, las finalidades, categorías de datos, destinatarios,
  transferencias, conservación, campos obligatorios y opcionales, y canal para
  ejercer derechos.
- Versión, fecha de vigencia y enlaces a políticas aplicables.
- Ayni publica el aviso de privacidad de sus propias cuentas. Para una
  aplicación cliente, expone el aviso configurado por esa aplicación sin
  redactar hechos ni roles que el administrador no haya confirmado.
- El aviso separa la recolección necesaria para prestar el servicio de
  cualquier uso adicional por Ayni para mejorar sus modelos o componentes.
  Cada uso adicional tiene una decisión opcional independiente conforme a
  US-154.

### Estados y mensajes

- Aviso disponible: `Aviso de privacidad`.
- Aviso faltante: `La aplicación aún no publicó su aviso de privacidad.`
- Error: `No pudimos cargar el aviso de privacidad.`

## Happy path

```gherkin
Scenario: Leer el aviso vigente antes de entregar datos
  Given que la aplicación va a recopilar mis datos
  When abro "Aviso de privacidad"
  Then puedo consultar la versión vigente y los datos del responsable
  And encuentro las finalidades y el canal para ejercer mis derechos
```

## Bad path

```gherkin
Scenario: La aplicación no tiene aviso publicado
  Given que la aplicación no configuró un aviso vigente
  When inicia un flujo que requiere mostrarlo
  Then la aplicación no presenta un aviso de otra aplicación como sustituto
  And informa que falta configuración
  And no inicia el tratamiento que requiere ese aviso
```

## Criterios de aceptación

- El aviso se puede leer antes de recopilar los datos a los que se refiere y
  sigue disponible después desde la aplicación.
- El aviso es independiente de la aceptación de términos y no registra por sí
  mismo un consentimiento.
- Aceptar los términos no activa el uso de imágenes, etiquetas ni trazas para
  mejoras propias de Ayni. Esas finalidades empiezan desactivadas y la persona
  las puede activar por separado en la app cliente; su preferencia se conserva
  por persona y aplicación y se puede revocar según US-155.
- El desarrollador integrador debe mostrar el aviso y los switches antes de
  capturar o sincronizar datos para esos usos adicionales, e informar a sus
  usuarios. La recolección necesaria para el servicio del SDK tiene aviso y
  base aplicable propios.
- Publicar una nueva versión conserva la anterior y muestra la versión vigente
  correspondiente a cada flujo.
- La información requerida se verifica contra el tratamiento configurado y la
  normativa vigente; no se publica como asesoría legal de Ayni.
- Esta historia complementa US-147, que documenta los datos enviados y
  guardados por el SDK.
