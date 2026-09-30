# US-155 — Revocar el consentimiento de una finalidad

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de una aplicación, quiero retirar mi consentimiento de una
finalidad desde un canal sencillo, para detener el tratamiento futuro que
dependa de esa decisión.

## Interfaz

### Ubicación

Aplicación cliente → `Privacidad` → `Mis preferencias`.

### Elementos y texto visible

- Estado por finalidad: `Activa` o `Desactivada`.
- Las finalidades opcionales de mejora propia de Ayni se muestran por separado
  para imágenes y etiquetas, y para trazas técnicas; cambiar una no modifica la
  otra ni la recolección necesaria para el servicio del SDK.
- Acción `Retirar consentimiento` y confirmación que explica qué tratamiento se
  detendrá.
- Indicación del canal para solicitar acceso, rectificación o eliminación de
  datos ya recopilados.

### Estados y mensajes

- Carga: `Actualizando tus preferencias…`.
- Éxito: `Consentimiento retirado.`
- Error: `No pudimos actualizar tu preferencia. El tratamiento sigue pausado.`

## Happy path

```gherkin
Scenario: Retirar una finalidad opcional
  Given que tengo activa una finalidad basada en consentimiento
  When retiro ese consentimiento
  Then se registra la revocación
  And se detienen nuevas capturas, colas y envíos de esa finalidad
  And mis otras finalidades vigentes no cambian
```

## Bad path

```gherkin
Scenario: Falla el guardado de la revocación
  Given que solicito retirar un consentimiento
  When no se puede guardar el cambio
  Then el tratamiento afectado se pausa por seguridad
  And recibo instrucciones para completar la solicitud
```

## Criterios de aceptación

- Revocar no requiere indicar un motivo y es al menos tan sencillo como otorgar
  consentimiento.
- La revocación detiene diligentemente el tratamiento futuro asociado y no
  cancela finalidades distintas que sigan vigentes.
- Si la persona revoca sin conexión, la app detiene inmediatamente nuevas
  capturas de esa finalidad, elimina su cola local pendiente y sincroniza la
  revocación con Ayni cuando vuelve la conexión.
- Para consultar o revocar una decisión, la app integradora debe enviar el
  mismo identificador opaco, aleatorio y estable, único dentro de esa
  aplicación. Ayni no solicita la identidad real ni acepta un ID reutilizado
  entre aplicaciones.
- La revocación no se presenta como eliminación retroactiva de datos ya
  recibidos por Ayni; se ofrece el canal de derechos aplicable para solicitar su
  eliminación.
- El registro conserva la fecha, la finalidad y la versión de consentimiento
  retirada para trazabilidad, sin conservar datos innecesarios.
