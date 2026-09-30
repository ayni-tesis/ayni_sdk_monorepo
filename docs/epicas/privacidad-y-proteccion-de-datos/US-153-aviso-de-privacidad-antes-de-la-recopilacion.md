# US-153 — Consultar el aviso de privacidad antes de la recopilación

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de Ayni o de una aplicación integrada con el SDK, quiero
conocer quién trata mis datos, qué datos usa y con qué finalidad antes de que
la aplicación los recopile o los entregue al SDK, para decidir con información clara.

## Interfaz

### Ubicación

En el registro de una cuenta Ayni y, para una aplicación cliente, antes de que
su interfaz capture o entregue datos al SDK; acceso posterior desde `Privacidad`.
La aplicación cliente controla ese paso. El SDK recibe bytes que la aplicación
ya capturó y no puede mostrar el aviso ni impedir por sí solo la captura.

### Elementos y texto visible

- Aviso legible que identifica al responsable y, cuando corresponda, al
  encargado por su nombre declarado, las finalidades, categorías de datos, destinatarios,
  transferencias, conservación, campos obligatorios y opcionales, y canal para
  ejercer derechos.
- Versión, fecha de vigencia y enlaces a políticas aplicables.
- Ayni publica el aviso de privacidad de sus propias cuentas. Para una
  aplicación cliente, expone el aviso configurado por esa aplicación sin
  redactar hechos ni roles que el administrador no haya confirmado.

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
  When la aplicación intenta iniciar la captura que requiere el aviso
  Then la aplicación no presenta un aviso de otra aplicación como sustituto
  And informa que falta configuración
  And no inicia la captura ni entrega datos al SDK
```

## Criterios de aceptación

- El aviso se puede leer antes de recopilar los datos a los que se refiere y
  sigue disponible después desde la aplicación.
- La aplicación cliente muestra el aviso antes de capturar datos o entregarlos
  al SDK. Esta historia no agrega una compuerta de aviso a `AyniSdk.run()`, que
  procesa bytes proporcionados por la aplicación y también puede ejecutarse sin
  conexión.
- El aviso es independiente de la aceptación de términos y no registra por sí
  mismo un consentimiento.
- Publicar una nueva versión conserva la anterior y muestra la versión vigente
  correspondiente a cada flujo.
- La información requerida se verifica contra el tratamiento configurado y la
  normativa vigente; no se publica como asesoría legal de Ayni.
- Cada tratamiento publicado identifica por nombre a la persona u organización
  que declara el rol de responsable o encargado. Un rol sin entidad identificada
  bloquea la publicación.
- Esta historia complementa US-147, que documenta los datos enviados y
  guardados por el SDK.

## Estado de implementación

- El aviso Ayni v1 se enlaza desde el registro y la navegación autenticada; es
  un borrador visible con los datos observables en el producto y enumera los
  campos legales que siguen pendientes. Mientras siga como borrador, la
  creación de cuentas está bloqueada.
- Las aplicaciones cliente conservan el endpoint público de la versión
  publicada y tienen una página legible que representa ese snapshot y muestra
  los estados de aviso faltante y error. El administrador puede abrir esa
  página desde `Privacidad y datos`. El aviso refleja el nombre y rol que el
  administrador declaró para cada finalidad, sus enlaces a políticas
  aplicables, o indica si no declaró otros enlaces.
- Los snapshots históricos sin una entidad declarada se conservan, pero no se
  sirven como aviso vigente hasta republicar el mapa con esa entidad.
- La captura y presentación del aviso pertenecen a la app cliente: `AyniSdk.run()`
  procesa los bytes que recibe y no puede presentar el aviso ni determinar si la
  app ya lo mostró. La app cliente debe consultar y presentar este aviso antes
  de capturar o entregar esos bytes, incluso si ejecutará el workflow sin conexión.

## Revisión legal antes de producción

La vista de cuentas Ayni permanece en borrador hasta confirmar identidad y
contacto del responsable, proveedores/destinatarios, transferencias,
conservación y el contenido exigible con asesoría legal. El aviso de una
aplicación cliente refleja las declaraciones versionadas de su administrador;
la publicación del snapshot no es revisión legal ni certifica cumplimiento.
