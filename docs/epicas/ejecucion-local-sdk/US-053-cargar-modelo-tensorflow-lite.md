# US-053 — Cargar un modelo TensorFlow Lite local

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero cargar una versión TensorFlow Lite instalada para ejecutar el nodo de modelo localmente.

## Interfaz

La carga es interna. Si falta el archivo, `sdk.run` devuelve `modelNotAvailable`; la app muestra `Falta un modelo requerido. Sincroniza la aplicación e inténtalo nuevamente.`

## Happy path

```gherkin
Scenario: Cargar un modelo instalado
  Given que una versión TensorFlow Lite está instalada y verificada
  When un workflow requiere esa versión
  Then el SDK crea el intérprete local del modelo
```

## Bad path

```gherkin
Scenario: Modelo no instalado
  Given que un workflow requiere una versión no disponible localmente
  When el SDK intenta cargarla
  Then devuelve modelNotAvailable
  And no ejecuta el nodo
```

## Criterios de aceptación

- El SDK carga solo archivos previamente verificados.
- Un fallo de carga identifica la versión de modelo afectada.
- El SDK no descarga modelos durante la ejecución.
