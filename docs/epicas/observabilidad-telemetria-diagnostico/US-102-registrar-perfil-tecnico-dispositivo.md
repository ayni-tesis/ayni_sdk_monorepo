# US-102 — Registrar el perfil técnico del dispositivo

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como app integradora, quiero consultar el perfil técnico disponible a través del SDK para comparar compatibilidad y rendimiento entre dispositivos.

## Happy path

```gherkin
Scenario: Telemetría habilitada
  Given que la app integradora solicita el perfil técnico
  When llama a AyniSdk.getDeviceProfile()
  Then devuelve o adjunta modelo de dispositivo, plataforma, versión de SO, RAM en rango y versiones de app y SDK cuando estén disponibles
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
- `AyniSdk.getDeviceProfile()` devuelve un tipo público tipado con los campos técnicos permitidos; consultarlo no hace solicitudes de red ni persiste el perfil.
- Cuando la telemetría está habilitada, US-103 incorpora el perfil al registro de ejecución; la app puede usar la misma respuesta tipada para la condición de control.

## Criterios para validación técnica

- El perfil versionado incluye plataforma, versión de SO/API, modelo de dispositivo, rango de RAM y versiones de app y SDK; incorpora SoC, backend efectivo, red, batería y temperatura cuando el SDK o la app puedan obtenerlos.
- La app puede declarar las condiciones experimentales que el SDK no mide; todos esos valores se marcan como reportados por el cliente y no verificados por el servidor.
- El SDK solo serializa campos técnicos permitidos; RAM/SoC pueden ser declarados por la app o las herramientas de prueba cuando el sistema no los exponga al SDK.
- Un campo ausente o no disponible se omite o se representa como desconocido; no invalida por sí solo el registro.
- El perfil no afirma verificar el dispositivo ni incluye IMEI, MAC, identificador publicitario, ubicación, contactos, imágenes o credenciales.
- `Recursos` → `Datos y privacidad` (US-147) describe, en el mismo cambio, los
  datos que esta historia agrega o cambia, la política que los habilita, el
  consentimiento requerido y su retención.
