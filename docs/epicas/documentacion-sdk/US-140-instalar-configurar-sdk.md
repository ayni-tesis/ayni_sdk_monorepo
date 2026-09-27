# US-140 — Instalar y configurar el SDK

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter, quiero conocer los requisitos y cada opción de
configuración del SDK para integrarlo correctamente en mi app y en cada entorno.

## Interfaz

### Ubicación

`Comenzar` → `Instalación y configuración`.

### Elementos y texto visible

- Sección `Requisitos`: versión de Dart (`>=3.8.0 <4.0.0`), Flutter y
  plataformas soportadas (las que declare US-091).
- Sección `Instalar`: pestañas `Desde Git` y `Ruta local`; la pestaña
  `pub.dev` aparece cuando se publique el paquete (US-096).
- Sección `Configurar el cliente`: tabla con cada parámetro público de
  `AyniSdk`, su tipo, si es obligatorio, su valor por defecto y su propósito
  (por ejemplo, `syncTimeout`, 30 segundos por defecto).
- Sección `Directorio de almacenamiento`: qué guarda el SDK en
  `storageDirectory` y por qué debe ser un directorio persistente de la app.
- Sección `Entorno de desarrollo local`: uso de `allowInsecureLoopback` con un
  servidor local; aviso `Peligro`: `Nunca actives allowInsecureLoopback en
  producción.`
- Sección `Configuración por plataforma`: Android e iOS, con los ajustes que
  exijan US-092 y US-093.

### Estados y mensajes

- Cada opción con un valor no admitido describe el resultado que devuelve el
  SDK, por ejemplo `SyncStatus.error` al usar `http` fuera de loopback.

## Happy path

```gherkin
Scenario: Configurar el SDK para producción
  Given que leo "Instalación y configuración"
  When configuro AyniSdk con una URL HTTPS, la credencial y un directorio persistente
  Then la sincronización funciona sin opciones adicionales
```

```gherkin
Scenario: Probar contra un servidor local
  Given que ejecuto el servidor de Ayni en mi equipo
  When sigo la sección "Entorno de desarrollo local"
  Then puedo sincronizar contra http://localhost con allowInsecureLoopback
```

## Bad path

```gherkin
Scenario: URL insegura fuera de loopback
  Given que configuro serverUrl con http y un host que no es loopback
  When sincronizo
  Then el SDK devuelve SyncStatus.error sin enviar la credencial
  And la página explica por qué y cómo corregirlo
```

## Criterios de aceptación

- La tabla de parámetros coincide con el constructor público de `AyniSdk`; un
  parámetro que US-090 marque como interno no se documenta.
- Cada valor por defecto citado se comprueba contra el código de la versión
  documentada.
- La regla de envío de la credencial (HTTPS, o HTTP solo en loopback con
  `allowInsecureLoopback`) se explica con el comportamiento real del SDK.
- Las secciones de plataforma solo describen requisitos que existan en el
  paquete; si una plataforma no tiene ajustes, se dice explícitamente.
