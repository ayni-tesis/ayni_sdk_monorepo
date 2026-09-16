# US-024 — Crear un workflow

**Épica:** Workflows DAG

## Historia de usuario

Como administrador de un workspace, quiero crear un workflow borrador para
definir una cadena o DAG de inferencia para una aplicación.

## Interfaz

Dashboard → Aplicación → `Workflows` → `Crear workflow`. El formulario muestra el título `Crear workflow`, el campo obligatorio `Nombre del workflow` y los botones `Crear borrador` y `Cancelar`. Durante el envío muestra `Creando borrador…`; al terminar, `Workflow creado. Ya puedes agregar nodos.`; si falta el nombre, `Ingresa un nombre para el workflow.`; si la aplicación está archivada, `No puedes crear workflows en una aplicación archivada.`

## Happy path

```gherkin
Scenario: Crear un workflow con nombre válido
  Given que soy administrador de una aplicación activa
  When creo un workflow con un nombre válido
  Then el sistema crea un workflow en estado borrador
  And lo asocia únicamente a esa aplicación
```

## Bad path

```gherkin
Scenario: Crear un workflow sin nombre
  Given que soy administrador de una aplicación activa
  When intento crear un workflow sin nombre
  Then el sistema rechaza la creación
  And no crea el workflow
```

```gherkin
Scenario: Crear un workflow en una aplicación archivada
  Given que una aplicación está archivada
  When intento crear un workflow
  Then el sistema rechaza la operación con el estado applicationArchived
```

## Criterios de aceptación

- Solo los administradores pueden crear workflows.
- Un workflow nuevo inicia como borrador y pertenece a una aplicación.
- Un workflow no contiene nodos ni versión publicada al crearse.
