# US-102 — Registrar el perfil técnico del dispositivo

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como app integradora, quiero consultar el perfil técnico disponible a través del SDK para comparar compatibilidad y rendimiento entre dispositivos.

## Happy path

```gherkin
Scenario: Telemetría habilitada
  Given que la app integradora solicita el perfil técnico
  When llama a AyniSdk.getDeviceProfile()
  Then devuelve modelo de dispositivo, plataforma, versión de SO y RAM en rango cuando estén disponibles
```

## Bad path

```gherkin
Scenario: Campo técnico no disponible
  Given que el sistema operativo no expone un dato técnico
  When el SDK crea una traza
  Then omite ese dato o lo marca como desconocido
  And mantiene el envío válido
```

## Criterios de aceptación

- El perfil no contiene imágenes, ubicación, contactos ni identificadores de hardware.
- La RAM se registra en rangos, no como información innecesariamente precisa.
- Los datos técnicos se asocian al identificador de instalación.
- `AyniSdk.getDeviceProfile()` devuelve `DeviceProfile`, un tipo público con los campos permitidos del dispositivo; consultarlo no hace solicitudes de red ni persiste el perfil. Las versiones de la app y del SDK pertenecen a la procedencia del software en la traza, no a `DeviceProfile`.
- Cuando la telemetría está habilitada, US-103 incorpora el perfil al registro de ejecución; la app puede usar la misma respuesta tipada para la condición de control.

## Criterios para validación técnica

- El perfil versionado incluye plataforma, versión de SO/API, modelo de dispositivo, rango de RAM y SoC cuando esté disponible. Backend efectivo, red, batería y temperatura pertenecen al contexto de la traza, no a `DeviceProfile`.
- La app puede declarar las condiciones experimentales y del entorno que el SDK no mide en el contexto de la traza; todos esos valores se marcan como reportados por el cliente y no verificados por el servidor.
- El SDK solo serializa campos técnicos permitidos; RAM/SoC pueden ser declarados por la app o las herramientas de prueba cuando el sistema no los exponga al SDK.
- Un campo ausente o no disponible se omite o se representa como desconocido; no invalida por sí solo el registro.
- El perfil no afirma verificar el dispositivo ni incluye IMEI, MAC, identificador publicitario, ubicación, contactos, imágenes o credenciales.
- Las versiones de la app/SDK y el contexto experimental se declaran en la procedencia de software o el contexto de la traza US-103; no se duplican dentro del perfil del dispositivo.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento que resulte aplicable (sin tratar `sdkImprovement` como consentimiento para la validación) y su retención.
