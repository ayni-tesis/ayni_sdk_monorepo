# US-016 — Obtener el manifiesto de descarga de un modelo

**Épica:** Modelos

## Historia de usuario

Como SDK autenticado de una aplicación, quiero obtener el manifiesto de una
versión de modelo para descargar y verificar el artefacto localmente.

## Interfaz

### Ubicación

API pública del SDK durante sincronización; no existe una pantalla de dashboard para esta operación.

### Elementos y texto visible

- La API devuelve un `ModelDownloadManifest` con versión, hash, tamaño y URL temporal.
- La app anfitriona no recibe ni muestra la URL temporal.

### Estados y mensajes

- Éxito de SDK: manifiesto interno disponible para descarga.
- Versión no encontrada: error `modelVersionNotFound` con mensaje `La versión del modelo ya no está disponible.`
- Credencial revocada: error `credentialRevoked` con mensaje `La credencial fue revocada. Genera una nueva credencial.`

## Happy path

```gherkin
Scenario: Obtener un manifiesto de una versión propia
  Given que el SDK usa una credencial activa de una aplicación
  And la aplicación tiene acceso a una versión de modelo
  When el SDK solicita su manifiesto de descarga
  Then el servidor devuelve el identificador de versión, hash, tamaño y ubicación temporal del archivo
```

## Bad path

```gherkin
Scenario: Solicitar una versión de otra aplicación
  Given que el SDK usa una credencial activa de una aplicación
  When solicita el manifiesto de una versión perteneciente a otra aplicación
  Then el servidor rechaza la solicitud
  And no revela los metadatos ni la ubicación del archivo
```

```gherkin
Scenario: Usar una credencial revocada
  Given que el SDK usa una credencial revocada
  When solicita un manifiesto de descarga
  Then el servidor rechaza la solicitud con el estado credentialRevoked
  And no entrega el manifiesto
```

```gherkin
Scenario: Solicitar una versión inexistente
  Given que el SDK usa una credencial activa de una aplicación
  When solicita el manifiesto de una versión que no existe
  Then el servidor informa que la versión no fue encontrada
```

## Criterios de aceptación

- El manifiesto solo se entrega a credenciales activas de la aplicación propietaria.
- El manifiesto incluye identificador de versión, hash de integridad y tamaño.
- La ubicación de descarga no es pública ni permanente.
- El SDK no recibe manifiestos de otras aplicaciones o workspaces.
- Una versión inexistente o una credencial revocada no entrega información del artefacto.
