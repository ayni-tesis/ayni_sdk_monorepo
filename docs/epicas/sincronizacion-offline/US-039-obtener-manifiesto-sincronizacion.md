# US-039 — Obtener el manifiesto de sincronización

**Épica:** Sincronización offline

## Historia de usuario

Como SDK autenticado, quiero obtener un manifiesto de sincronización para saber qué workflows y versiones de modelo pertenecen a mi aplicación.

## Interfaz

Operación interna de `sdk.sync()`. La app no ve el manifiesto ni URLs; si falla, recibe `credentialRevoked` con `La credencial fue revocada. Genera una nueva credencial para sincronizar.`

## Happy path

```gherkin
Scenario: Obtener manifiesto propio
  Given que el SDK usa una credencial activa
  When solicita el manifiesto de sincronización
  Then el servidor devuelve únicamente workflows publicados y no archivados con sus dependencias de modelo
```

## Bad path

```gherkin
Scenario: Credencial revocada
  Given que el SDK usa una credencial revocada
  When solicita el manifiesto
  Then el servidor rechaza la solicitud con credentialRevoked
  And no entrega recursos
```

## Criterios de aceptación

- El manifiesto está limitado a una aplicación.
- Incluye identificadores y versiones, no secretos.
- Una credencial no puede obtener recursos de otra aplicación.
