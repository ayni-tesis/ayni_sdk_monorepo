# US-155 — Revocar el consentimiento de una finalidad

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de una aplicación integrada con Ayni, quiero retirar por
separado mi consentimiento para cada uso opcional, para que la app detenga ese
uso y registre mi decisión sin afectar otras finalidades.

## Integración

La app cliente implementa `Privacidad` → `Mis preferencias`, muestra cada
finalidad como `Activa` o `Desactivada` y ofrece `Retirar consentimiento` con
una confirmación que explica el tratamiento que se detendrá. Al confirmar,
desactiva localmente esa finalidad primero y registra la decisión con
`AyniSdk.recordConsent(decision: ConsentDecision.declined)`. La app debe
conservar la elección local aunque el recibo quede pendiente y no debe esperar
una conexión para detener tratamientos futuros.

La pantalla informa `Actualizando tus preferencias…` mientras guarda. Al guardar
la decisión localmente muestra `Consentimiento retirado.`; si el guardado local
falla, mantiene el tratamiento pausado y muestra `No pudimos actualizar tu
preferencia. El tratamiento sigue pausado.` junto al canal de contacto aplicable.

La otra finalidad y el tratamiento necesario para el servicio no cambian. El
identificador enviado es el mismo UUID v4 opaco, aleatorio y estable que se usa
al otorgar consentimiento, único dentro de esa aplicación.
El campo `noticeVersion` del recibo de rechazo conserva la versión asociada al
consentimiento que se retira. La app guarda ese dato junto a la preferencia
vigente; no lo reemplaza por una versión de aviso posterior.

## Sin conexión y datos ya recibidos

Si la persona revoca offline, la app pausa de inmediato esa finalidad y elimina
de sus propias colas los datos asociados aún no enviados. `recordConsent()`
guarda un recibo mínimo de rechazo con la versión del consentimiento retirado
para sincronizarlo después. Si devuelve
`pending`, la preferencia sigue desactivada; `AyniSdk.sync()` intenta el recibo
antes del manifiesto, pero un rechazo aún pendiente no bloquea la sincronización
necesaria de workflows y modelos.

El SDK todavía no captura ni sube imágenes, etiquetas o trazas y no tiene una
cola de esos datos que purgar. La épica futura de captura deberá aplicar el
estado por finalidad antes de recolectar o enviar y borrar su cola local al
revocarla. Los datos que Ayni ya recibió no se eliminan con este recibo: se
solicitan por el canal de derechos publicado en el aviso aplicable.

## Happy path

```gherkin
Scenario: Retirar una finalidad opcional
  Given que tengo activa una finalidad basada en consentimiento
  When retiro ese consentimiento
  Then la app desactiva esa finalidad inmediatamente
  And registra un recibo de rechazo para esa finalidad
  And mis otras finalidades vigentes no cambian
```

## Bad path

```gherkin
Scenario: No se puede guardar localmente la revocación
  Given que solicito retirar un consentimiento
  When el dispositivo no puede guardar el recibo
  Then la app mantiene pausado el tratamiento afectado
  And me ofrece el canal de contacto publicado por el responsable
```

## Criterios de aceptación

- Revocar no requiere indicar un motivo y la acción es tan sencilla como
  otorgar el consentimiento.
- La app pausa primero la finalidad revocada; las decisiones de otras
  finalidades y la recolección necesaria para el servicio permanecen iguales.
- La app usa el UUID v4 opaco de esa persona dentro de esa aplicación y registra
  el rechazo con la versión del consentimiento que retira.
- Sin conexión, el recibo queda en la cola local; el cambio local es inmediato y
  el SDK lo reintenta al sincronizar.
- La app elimina de sus colas locales los datos todavía no enviados de esa
  finalidad. El SDK solo eliminará colas de datos cuando la épica de captura las
  incorpore.
- Un fallo al guardar el recibo mantiene pausado el tratamiento e informa el
  canal aplicable para completar la solicitud.
- La interfaz muestra `Actualizando tus preferencias…`, luego `Consentimiento
  retirado.` al guardar localmente, o `No pudimos actualizar tu preferencia. El
  tratamiento sigue pausado.` si no se pudo guardar.
- Los datos ya recibidos por Ayni no se eliminan automáticamente; la app ofrece
  el canal de derechos del aviso correspondiente.
- `Recursos` → `Datos y privacidad` describe el recibo de revocación y las
  limitaciones actuales de recolección y almacenamiento.
