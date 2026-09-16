# US-072 — Eliminar evidencia local confirmada

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK elimine la copia local de una
evidencia después de confirmar su carga para liberar almacenamiento.

## Interfaz

Tras confirmación, el estado pasa de `Enviando` a `Enviada` y desaparece de la cola local. Si no hay confirmación permanece `Pendiente`; nunca se muestra como enviada antes de confirmarse.

## Happy path

```gherkin
Scenario: Confirmación de carga recibida
  Given que el servidor confirmó una carga de evidencia
  When el SDK procesa la confirmación
  Then elimina la copia local optimizada
  And la retira de la cola pendiente
```

## Bad path

```gherkin
Scenario: Confirmación no recibida
  Given que el SDK envió una evidencia pero no recibió confirmación
  When termina el intento de carga
  Then conserva la copia local como pendiente
  And no la elimina
```

## Criterios de aceptación

- El SDK elimina la evidencia local solo después de una confirmación válida.
- Una carga incierta conserva la evidencia para evitar pérdida de datos.
- La eliminación no afecta workflows ni modelos instalados.
