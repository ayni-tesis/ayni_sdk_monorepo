# US-042 — Validar un workflow sincronizado

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero validar el JSON de un workflow descargado para evitar ejecutar una definición dañada, incompatible o cíclica.

## Interfaz

La app recibe `invalidWorkflow` con el identificador y versión, nunca el JSON interno. Texto sugerido: `La actualización de <workflow> no es compatible. Se mantuvo la última versión válida.`

## Happy path

```gherkin
Scenario: Workflow descargado válido
  Given que el SDK descargó una versión de workflow
  When valida su esquema, tipos, DAG y modelos requeridos
  Then marca la versión como apta para instalarse localmente
```

## Bad path

```gherkin
Scenario: Workflow con ciclo o nodo desconocido
  Given que el SDK descargó una versión de workflow
  When encuentra un ciclo o un tipo de nodo no admitido
  Then rechaza la versión
  And no la deja disponible para ejecución
```

## Criterios de aceptación

- El SDK valida el esquema, aciclicidad, tipos de nodo y conexiones.
- El SDK verifica que las versiones de modelo referenciadas estén declaradas.
- Una validación fallida conserva el workflow local anterior.
