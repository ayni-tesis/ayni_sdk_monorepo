# US-022 — Descargar el artefacto de un modelo

**Épica:** Modelos

## Historia de usuario

Como SDK autenticado, quiero descargar el archivo de una versión desde su
manifiesto para disponer del modelo en el dispositivo.

## Interfaz

### Ubicación

Proceso interno del SDK mostrado a la app mediante el resultado de sincronización.

### Elementos y texto visible

- El resultado por recurso incluye `downloaded`, `pending` o `downloadFailed`.
- La app puede mostrar el progreso con el texto `Descargando modelo <versión>…`.

### Estados y mensajes

- Éxito: `Modelo <versión> descargado. Verificando integridad…`.
- URL vencida: `La descarga del modelo venció. Intenta sincronizar nuevamente.`
- Red interrumpida: `La descarga se interrumpió. Se reintentará cuando haya conexión.`

## Happy path

```gherkin
Scenario: Descargar un archivo desde un manifiesto válido
  Given que el SDK recibió un manifiesto de descarga válido
  When descarga el artefacto desde la ubicación temporal indicada
  Then guarda el archivo como temporal hasta verificar su integridad
```

## Bad path

```gherkin
Scenario: Ubicación de descarga expirada
  Given que el SDK recibió un manifiesto con una ubicación temporal expirada
  When intenta descargar el artefacto
  Then informa que la descarga no está disponible
  And no registra un archivo incompleto como modelo válido
```

```gherkin
Scenario: Descarga interrumpida
  Given que el SDK está descargando un artefacto
  When la conexión se interrumpe
  Then conserva el archivo solo como temporal o lo descarta
  And no reemplaza una versión local válida
```

## Criterios de aceptación

- El SDK usa únicamente una ubicación recibida en un manifiesto autenticado.
- Un archivo descargado no queda disponible para ejecución antes de US-017.
- Una descarga fallida no reemplaza una versión local válida.
