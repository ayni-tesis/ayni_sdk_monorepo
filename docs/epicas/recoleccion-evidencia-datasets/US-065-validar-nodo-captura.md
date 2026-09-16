# US-065 — Validar un nodo de captura

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como administrador, quiero que el dashboard valide el nodo de captura para no publicar workflows que recolecten evidencia incompleta.

## Interfaz

`Validar workflow` muestra en `Errores de validación`: `El nodo "Capturar evidencia" necesita una imagen.` o `… necesita un resultado de inferencia.` Si es correcto muestra `El nodo de captura está listo.`

## Happy path

```gherkin
Scenario: Nodo con imagen y resultado conectados
  Given que dataset.capture recibe una imagen y una salida compatible de inferencia
  When valido el borrador
  Then el sistema considera válido el nodo de captura
```

## Bad path

```gherkin
Scenario: Nodo sin imagen de origen
  Given que dataset.capture no tiene una imagen conectada
  When valido el borrador
  Then el sistema informa el puerto faltante
  And no permite publicar el workflow
```

## Criterios de aceptación

- El nodo requiere imagen y resultado de inferencia.
- Solo se publica si todas sus entradas obligatorias están conectadas.
- La validación no modifica el borrador.
