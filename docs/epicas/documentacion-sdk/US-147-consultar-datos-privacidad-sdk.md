# US-147 — Saber qué datos envía y guarda el SDK

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador responsable de una app Flutter, quiero saber qué datos envía
y guarda el SDK para declarar la privacidad de mi app y responder a mis
usuarios.

## Interfaz

### Ubicación

`Recursos` → `Datos y privacidad`.

### Elementos y texto visible

- Tabla `Datos que el SDK envía`: dato, cuándo se envía, a qué endpoint y si es
  opcional. En la versión actual:
  - La credencial del SDK, en el encabezado `Authorization`, solo a los
    endpoints `/sdk/*` del servidor de Ayni.
  - La descarga de cada archivo de modelo, que va a una URL firmada del
    almacenamiento de objetos, un host distinto del servidor, sin credencial.
- Tabla `Datos que el SDK guarda en el dispositivo`, dentro de
  `storageDirectory`: inventario de sincronización (`sync-inventory.json`),
  definiciones de workflow, archivos de modelo `.tflite` con sus metadatos y
  archivos temporales de descarga, y cómo eliminarlos.
- Sección `Lo que el SDK no hace`: `No sube imágenes ni entradas del modelo
  durante la sincronización.` y `No envía telemetría.`, cada una válida solo
  mientras la funcionalidad correspondiente no exista.
- Sección `Datos opcionales`, que se agrega con la telemetría (US-100 a US-113)
  y la recolección de evidencia (US-063 a US-074): qué se envía, qué política
  lo habilita, el consentimiento requerido y el periodo de retención.

### Estados y mensajes

- Cada tabla indica `Válido para ayni_sdk <versión>`.

## Happy path

```gherkin
Scenario: Completar la declaración de privacidad de la app
  Given que debo declarar los datos que recoge mi app
  When consulto "Datos y privacidad"
  Then sé qué datos envía el SDK, a dónde y si son opcionales
  And sé qué guarda en el dispositivo y cómo borrarlo
```

## Bad path

```gherkin
Scenario: Funcionalidad que cambia los datos enviados
  Given que una versión nueva del SDK agrega telemetría o recolección de imágenes
  When se publica esa versión
  Then la página ya describe los nuevos datos, la política que los habilita y el consentimiento requerido
```

## Criterios de aceptación

- La página describe solo lo que hace la versión documentada, comprobado contra
  el código del SDK.
- Las historias que agreguen envío de datos (telemetría, evidencia) incluyen la
  actualización de esta página en sus criterios de aceptación.
- Se indica explícitamente cuándo se recolectan imágenes, telemetría o datos
  técnicos del dispositivo, como exige la guía de formato de historias.
- La página no constituye asesoría legal y lo dice.
