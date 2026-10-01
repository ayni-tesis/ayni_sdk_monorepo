## 0.1.0 - 2026-10-01

Primera versión estable de `ayni_sdk`.

### Novedades

- API pública para inicializar el SDK, sincronizar recursos y ejecutar workflows
  localmente en Android e iOS.
- Verificación de integridad de modelos y validación de workflows antes de
  instalarlos.
- Conservación de los recursos locales válidos cuando una actualización falla.

## 0.1.0-beta.1 - 2026-09-28

Esta versión es para pruebas piloto y puede cambiar.

### Novedades

- Primera versión preliminar del SDK para aplicaciones piloto.
- Sincronización con `AyniSdk.sync()` usando una credencial del SDK.
- Descarga de los workflows publicados de la aplicación y validación de su
  definición antes de instalarlos.
- Descarga de los modelos que usa cada workflow y verificación de su
  integridad con SHA-256.
- Ejecución local de workflows sincronizados e instalados previamente, sin
  conexión a internet.
- Conservación de la última versión válida cuando una actualización falla.
