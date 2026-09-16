# US-067 — Optimizar una imagen de evidencia

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como SDK, quiero optimizar una imagen antes de encolarla para reducir almacenamiento local y transferencia sin alterar el resultado de inferencia original.

## Interfaz

Proceso interno. En diagnóstico la evidencia figura como `Optimizando`; éxito `Evidencia preparada para envío.`; fallo `No se pudo preparar una evidencia. El resultado del análisis no se vio afectado.`

## Happy path

```gherkin
Scenario: Comprimir una imagen según la política
  Given que existe una evidencia local por recolectar
  When el SDK aplica tamaño y calidad permitidos por la política
  Then guarda la imagen optimizada para envío
```

## Bad path

```gherkin
Scenario: La optimización falla
  Given que existe una evidencia local
  When el SDK no puede optimizar su imagen
  Then descarta esa evidencia
  And no afecta el resultado de inferencia ni otros recursos locales
```

## Criterios de aceptación

- La optimización usa los límites configurados por la política.
- El SDK no modifica la imagen usada por el workflow.
- Una evidencia fallida no se sube como archivo incompleto.
