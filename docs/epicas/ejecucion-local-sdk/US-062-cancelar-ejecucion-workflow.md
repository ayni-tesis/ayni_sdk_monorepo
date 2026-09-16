# US-062 — Cancelar la ejecución de un workflow

**Épica:** Ejecución local del SDK

## Historia de usuario

Como usuario de una app móvil, quiero cancelar una ejecución en curso para dejar de usar recursos del dispositivo cuando ya no necesito el resultado.

## Interfaz

La app conserva el `executionId` y ofrece `Cancelar análisis` mientras está en curso. Tras pulsarlo muestra `Cancelando análisis…` y luego `Análisis cancelado.`; si ya no existe, `El análisis ya terminó o no está disponible.`

## Happy path

```gherkin
Scenario: Cancelar antes del siguiente nodo
  Given que un workflow está ejecutándose
  When la app solicita su cancelación
  Then el SDK detiene los nodos pendientes
  And devuelve el estado cancelled
```

## Bad path

```gherkin
Scenario: Cancelar una ejecución inexistente
  Given que no existe una ejecución activa con ese identificador
  When la app solicita cancelarla
  Then el SDK devuelve executionNotFound
  And no afecta otras ejecuciones
```

## Criterios de aceptación

- Cancelar no modifica workflows ni modelos instalados.
- El SDK no inicia nodos pendientes después de recibir la cancelación.
- Una ejecución cancelada no devuelve un resultado exitoso.
