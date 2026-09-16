# US-096 — Publicar una versión preliminar del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como equipo de desarrollo, quiero publicar una versión preliminar para probar el SDK con aplicaciones piloto antes de declarar estabilidad.

## Interfaz

Registro: etiqueta `Prelanzamiento`; notas `Esta versión es para pruebas piloto y puede cambiar.` Error: `Esta versión ya fue publicada y no puede reemplazarse.`

## Happy path

```gherkin
Scenario: Publicar una versión prerelease
  Given que el paquete pasó sus verificaciones
  When publico una versión con identificador preliminar
  Then los desarrolladores pueden instalar esa versión explícitamente
```

## Bad path

```gherkin
Scenario: Publicar una versión que ya existe
  Given que una versión del paquete ya fue publicada
  When intento publicarla nuevamente
  Then el registro rechaza la publicación
  And conserva el artefacto publicado originalmente
```

## Criterios de aceptación

- Una versión publicada es inmutable.
- La versión preliminar se identifica como no estable.
- La publicación incluye notas de cambios.
