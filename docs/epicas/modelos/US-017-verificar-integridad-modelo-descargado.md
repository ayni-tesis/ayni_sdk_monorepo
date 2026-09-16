# US-017 — Verificar la integridad de un modelo descargado

**Épica:** Modelos

## Historia de usuario

Como SDK, quiero verificar la integridad de un modelo descargado antes de
guardarlo como disponible para evitar ejecutar archivos dañados o alterados.

## Interfaz

### Ubicación

Proceso interno del SDK; se refleja en el resultado de sincronización de la app anfitriona.

### Elementos y texto visible

- La app recibe el estado de recurso `verified` o `integrityFailed` para la versión afectada.
- No se muestra el hash completo salvo que la app implemente una vista de diagnóstico.

### Estados y mensajes

- Éxito: `Modelo <versión> verificado.`
- Hash diferente: `No se pudo verificar la integridad del modelo. Se mantuvo la versión anterior.`
- Descarga incompleta: `La descarga del modelo no se completó. Inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Archivo descargado con hash válido
  Given que el SDK descargó un modelo y posee su manifiesto
  When calcula un hash igual al hash indicado en el manifiesto
  Then el SDK guarda el modelo como versión local válida
  And permite que los workflows que lo requieran puedan ejecutarlo
```

## Bad path

```gherkin
Scenario: Archivo descargado con hash diferente
  Given que el SDK descargó un modelo y posee su manifiesto
  When calcula un hash diferente al hash indicado en el manifiesto
  Then el SDK descarta el archivo descargado
  And informa un error de integridad
  And no permite ejecutar esa versión
```

```gherkin
Scenario: Descarga interrumpida
  Given que el SDK está descargando un modelo
  When la conexión se interrumpe antes de completar la descarga
  Then el SDK no registra el archivo incompleto como una versión válida
  And conserva la última versión local válida si existe
```

## Criterios de aceptación

- El SDK compara el hash calculado con el hash recibido en el manifiesto.
- Solo un archivo con integridad válida se marca como disponible.
- Un archivo con hash inválido o incompleto no se ejecuta ni reemplaza una versión válida.
- El SDK elimina o invalida los archivos temporales que no superan la verificación.
- El resultado de la verificación identifica la versión de modelo afectada.
