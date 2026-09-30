# US-154 — Otorgar consentimiento específico para una finalidad

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como persona usuaria de una aplicación, quiero decidir por separado sobre cada
finalidad opcional que use mis datos, para que el tratamiento no empiece sin mi
voluntad informada cuando el consentimiento sea la base aplicable.

## Interfaz

### Ubicación

En la aplicación cliente, después del aviso correspondiente y antes de iniciar
una finalidad opcional, como telemetría o recolección de evidencia.

### Elementos y texto visible

- Una decisión desmarcada por finalidad, con enlace a su aviso y efecto de
  aceptar o rechazar.
- Para usos adicionales de Ayni, ofrece dos finalidades separadas: usar
  imágenes y etiquetas para mejorar modelos de inferencia; y usar trazas
  técnicas para mejorar flujos, confiabilidad, inferencia u otros componentes
  del SDK, como almacenamiento. Cada una tiene su propio switch, empieza
  desactivada y explica el uso concreto.
- Acción afirmativa `Aceptar <finalidad>` y acción `Ahora no`.
- Identificación de la aplicación, versión del aviso y fecha de vigencia.

### Estados y mensajes

- Éxito: `Preferencia guardada.`
- Rechazo: `Puedes seguir usando las funciones que no requieren esta finalidad.`
- Error: `No pudimos guardar tu preferencia. Esta finalidad sigue desactivada.`

## Happy path

```gherkin
Scenario: Aceptar una finalidad opcional
  Given que leí el aviso de una finalidad opcional
  When la acepto expresamente
  Then se registra mi decisión para esa finalidad y versión
  And esa finalidad puede ejecutarse según la política de la aplicación
```

## Bad path

```gherkin
Scenario: No aceptar telemetría opcional
  Given que no otorgué consentimiento para telemetría
  When ejecuto un workflow
  Then el SDK no encola ni envía telemetría de esa finalidad
  And la ejecución local permitida no se bloquea
```

## Criterios de aceptación

- La aceptación de términos, el aviso de privacidad y cada decisión de
  consentimiento se registran por separado.
- El sistema guarda la finalidad, versión informada, acción afirmativa y
  evidencia necesaria para demostrar la decisión, con minimización de datos.
- La aceptación de los términos no activa estos usos. Cada decisión opcional
  queda guardada por persona y aplicación hasta que se cambie o revoque, con
  un switch independiente por finalidad.
- Las decisiones sobre mejora propia de Ayni controlan únicamente ese uso
  adicional. La recolección necesaria para prestar el servicio del SDK se
  informa por separado y depende de su propia base aplicable.
- La aplicación cliente debe presentar los switches y avisar a sus usuarios
  antes de capturar o sincronizar datos para estas finalidades adicionales.
- Para registrar una decisión, la app integradora debe enviar un identificador
  opaco, aleatorio y estable de la persona, único dentro de esa aplicación. No
  se aceptan nombre, correo, teléfono ni hashes derivados de esos datos como
  sustituto; Ayni no recibe la identidad real ni permite reutilizar el ID entre
  aplicaciones.
- El recibo de Ayni vincula el identificador seudónimo con la aplicación,
  finalidad, versión del aviso, decisión y fecha; la app integradora conserva
  la relación entre el ID y su persona usuaria.
- Con consentimiento válido registrado localmente, la app puede recolectar esa
  finalidad sin conexión y dejar el recibo y los datos en una cola local.
- Al volver la conexión, primero se sincroniza el recibo de consentimiento y
  después los datos asociados. Si el recibo no se sincroniza, esos datos no se
  envían a Ayni y permanecen en la cola local.
- Las opciones no vienen premarcadas ni agrupadas con finalidades no
  relacionadas.
- Sin decisión válida no se ejecutan los tratamientos opcionales que dependan
  de consentimiento, incluidos los definidos por US-063 y US-100.
- El sistema no exige consentimiento para finalidades cuya base aplicable sea
  otra; esa base debe estar confirmada en el mapa de tratamientos.
- Los cambios materiales de finalidad o aviso vuelven a solicitar la decisión
  cuando corresponda según revisión legal.
