# US-154 — Otorgar consentimiento específico para una finalidad

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de una aplicación integrada con Ayni, quiero decidir por
separado si contribuyo imágenes a mejorar modelos o trazas técnicas a mejorar
el SDK, para que esos usos opcionales no se activen sin mi voluntad informada.

## Integración

La aplicación cliente presenta el aviso aplicable y dos switches independientes,
apagados por defecto. Explica cada finalidad y guarda la elección por persona y
aplicación. El SDK no construye esa interfaz ni activa opciones al aceptar los
términos; expone `AyniSdk.recordConsent()` para guardar cada acción.

| Finalidad | Datos | Uso adicional de Ayni |
| --- | --- | --- |
| `ConsentPurpose.modelImprovement` | Imágenes y etiquetas | Mejorar modelos de inferencia |
| `ConsentPurpose.sdkImprovement` | Trazas técnicas | Mejorar flujos, inferencia, confiabilidad, almacenamiento y otros componentes del SDK |

La recolección necesaria para prestar el servicio del SDK se informa y se basa
por separado. Estas decisiones controlan solo los usos adicionales de Ayni.

## Sincronización

`recordConsent()` guarda un recibo mínimo en el almacenamiento local antes de
intentar enviarlo a `POST /sdk/consents`. Si no hay conexión, `ConsentStatus.pending`
indica que quedó en cola. `AyniSdk.sync()` intenta enviar primero los recibos
pendientes y los conserva para reintentar si no son reconocidos. Ese fallo no
bloquea la sincronización necesaria de workflows y modelos. La app integradora
debe impedir cualquier futura carga de datos de una finalidad cuyo recibo siga
pendiente y conserva la relación entre el UUID v4 opaco y su persona usuaria.

El recibo solo contiene el ID aleatorio de la persona, la aplicación asociada a
la credencial, finalidad, decisión, versión del aviso, fecha local de la acción
y un ID de recibo para reintentar sin duplicarlo. No contiene nombre, correo,
teléfono ni hashes de identificadores directos. El servidor registra además la
fecha de recepción.

## Criterios de aceptación

- Cada switch inicia desactivado y representa una sola finalidad; aceptar los
  términos no concede estas opciones.
- El desarrollador de la app cliente muestra el aviso, presenta los dos
  switches antes de capturar o sincronizar datos para esos usos y avisa a sus
  usuarios. Debe respetar una opción desactivada y ofrecer cómo cambiarla o
  revocarla conforme a US-155.
- Las preferencias se guardan por persona y aplicación. La app integradora
  genera un UUID v4 opaco, aleatorio y estable, distinto para cada aplicación;
  Ayni no acepta PII ni hashes de PII.
- Cada decisión, tanto aceptación como rechazo, genera un recibo append-only con
  finalidad, versión del aviso y fecha de la decisión; reintentar el mismo
  recibo no lo duplica ni permite cambiar sus datos.
- Los recibos offline se conservan y se sincronizan antes de cualquier futura
  carga de datos asociada. Si la sincronización de un recibo falla, los datos de
  esa finalidad no se envían.
- Mientras el aviso de Ayni esté en borrador, el endpoint no registra recibos.
- La recolección necesaria para el servicio sigue su propia finalidad y base
  aplicable; no queda controlada por estos dos switches.
