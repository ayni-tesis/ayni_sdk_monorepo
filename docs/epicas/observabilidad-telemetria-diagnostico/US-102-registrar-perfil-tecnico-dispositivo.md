# US-102 — Registrar el perfil técnico del dispositivo

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como SDK, quiero registrar un perfil técnico del dispositivo para analizar compatibilidad y rendimiento de modelos.

## Happy path

```gherkin
Scenario: Telemetría habilitada
  Given que la política permite telemetría
  When el SDK crea una traza
  Then adjunta modelo de dispositivo, plataforma, versión de SO, RAM en rango y versiones de app y SDK
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
