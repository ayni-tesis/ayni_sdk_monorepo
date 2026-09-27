# US-139 — Seguir el inicio rápido del SDK

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter, quiero una guía de inicio rápido paso a paso para
sincronizar mi primer workflow publicado en pocos minutos.

## Interfaz

### Ubicación

`Comenzar` → `Inicio rápido`.

### Elementos y texto visible

- Requisitos previos: `Una aplicación en Ayni con un workflow publicado`,
  `Una credencial del SDK` y `Flutter con Dart 3.8 o superior`, cada uno con
  enlace a su guía.
- Pasos numerados:
  1. `Instala el SDK`: bloque para `pubspec.yaml`.
  2. `Guarda la credencial`: aviso `Advertencia` con `No incluyas la credencial
     en el código fuente ni en el control de versiones.`
  3. `Crea el cliente`: `AyniSdk` con `serverUrl`, `credential` y
     `storageDirectory`.
  4. `Sincroniza`: llamada a `sync()`.
  5. `Revisa el resultado`: `switch` sobre `SyncResult.status` con los mensajes
     `Sincronización completada.`, `Ya estás al día.`, `Sin conexión.` y
     `No se completó la sincronización. Revisa los recursos afectados.`
- Cierre: `Siguientes pasos` con enlaces a `Conceptos`, `Referencia de la API` y
  `Solucionar problemas`.

### Estados y mensajes

- Cada paso termina con `Resultado esperado:` y lo que la persona debe ver.
- Aviso final: `¿Algo no funcionó? Consulta Solucionar problemas de
  sincronización.`

## Happy path

```gherkin
Scenario: Sincronizar el primer workflow
  Given que tengo una aplicación con un workflow publicado y una credencial activa
  When sigo los pasos del inicio rápido en una app Flutter nueva
  Then sync() devuelve SyncStatus.updated
  And el resultado incluye el workflow publicado
```

```gherkin
Scenario: Repetir la sincronización
  Given que ya completé el inicio rápido
  When vuelvo a ejecutar el paso "Sincroniza"
  Then sync() devuelve SyncStatus.upToDate
```

## Bad path

```gherkin
Scenario: Credencial incorrecta
  Given que sigo el inicio rápido con una credencial revocada o mal copiada
  When ejecuto el paso "Sincroniza"
  Then sync() devuelve SyncStatus.error
  And la guía me indica revisar la credencial en "Solucionar problemas"
```

## Criterios de aceptación

- La guía usa solo la API pública documentada en US-143 y parte del contenido de
  US-095.
- Los fragmentos de código salen de un ejemplo que compila y se analiza en CI
  (US-150).
- La guía no menciona la ejecución de workflows hasta que US-050 exista; cuando
  exista, se agrega el paso `Ejecuta`.
- El paso de instalación refleja el canal real: dependencia `path` o `git`
  mientras el paquete tenga `publish_to: none`, y pub.dev después de US-096.
