# US-043 — Instalar un workflow validado

**Épica:** Sincronización offline

## Historia de usuario

Como SDK, quiero instalar un workflow validado de forma atómica para que la app siempre tenga una versión local consistente.

## Interfaz

El resultado por workflow cambia de `installing` a `availableOffline`. La app puede mostrar `Preparando <workflow> para uso sin conexión…` y luego `<workflow> está disponible sin conexión.`; ante fallo: `No se pudo guardar la actualización. Se mantuvo la versión anterior.`

## Happy path

```gherkin
Scenario: Instalar una versión validada
  Given que un workflow descargado superó la validación
  When el SDK lo guarda en el almacenamiento local
  Then registra la nueva versión como disponible
  And conserva cualquier versión anterior hasta finalizar la instalación
```

## Bad path

```gherkin
Scenario: Fallo al escribir el almacenamiento local
  Given que una versión de workflow fue validada
  When falla su instalación local
  Then el SDK informa un error de almacenamiento
  And conserva la última versión local válida
```

## Criterios de aceptación

- Un workflow se instala solo después de validarse.
- La instalación no deja una versión parcialmente disponible.
- Un fallo no reemplaza la última versión válida.
