# US-054 — Ejecutar un nodo de clasificación

**Épica:** Ejecución local del SDK

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK ejecute un modelo de clasificación para recibir etiquetas y niveles de confianza.

## Interfaz

`WorkflowResult.classification` contiene etiqueta y confianza. La app muestra, por ejemplo, `Resultado: <etiqueta>` y `Confianza: <porcentaje>%`; una salida inválida muestra `El modelo devolvió un resultado no compatible.`

## Happy path

```gherkin
Scenario: Clasificar una imagen
  Given que un nodo de clasificación tiene una imagen y modelo disponibles
  When el SDK ejecuta el nodo
  Then devuelve etiquetas y confianzas según el contrato del modelo
```

## Bad path

```gherkin
Scenario: Salida de modelo incompatible
  Given que el modelo devuelve una salida incompatible con su contrato registrado
  When el SDK procesa el resultado
  Then devuelve modelOutputInvalid
  And no propaga ese resultado al DAG
```

## Criterios de aceptación

- La clasificación se ejecuta localmente.
- El resultado respeta el contrato de salida registrado.
- Una salida inválida no se utiliza en nodos posteriores.
