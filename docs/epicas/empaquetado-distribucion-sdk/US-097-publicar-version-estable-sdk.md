# US-097 — Publicar una versión estable del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como equipo de desarrollo, quiero publicar una versión estable para que las aplicaciones adopten una release documentada del SDK.

## Interfaz

Registro: etiqueta `Estable`, número de versión y `Notas de cambios`. Si falta una verificación: `No puedes publicar esta versión como estable hasta completar las verificaciones requeridas.`

## Happy path

```gherkin
Scenario: Publicar versión estable verificada
  Given que una versión del SDK pasó las verificaciones de paquete y plataformas
  When la publico como versión estable
  Then queda disponible en el registro de paquetes con sus notas de cambios
```

## Bad path

```gherkin
Scenario: Publicar sin verificaciones requeridas
  Given que una versión no completó las verificaciones requeridas
  When intento publicarla como estable
  Then el proceso rechaza la publicación
  And no marca la versión como estable
```

## Criterios de aceptación

- Una versión estable declara número de versión y notas de cambios.
- El paquete publicado no puede sobrescribirse.
- Solo versiones verificadas se consideran estables.
