# US-006 — Aislar recursos por workspace

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como administrador de un workspace, quiero que las aplicaciones y recursos de
mi workspace estén aislados de otros workspaces para proteger su configuración
y sus modelos.

## Interfaz

### Ubicación

Rutas protegidas del dashboard, API del dashboard y API usada por el SDK.

### Elementos y texto visible

- Las listas y selectores muestran solo recursos del workspace activo.
- Los enlaces a recursos ajenos no muestran nombre, ID ni metadatos.

### Estados y mensajes

- Dashboard ante una ruta ajena: `No encontramos este recurso.`
- SDK/API ante una solicitud ajena: error tipado `resourceNotFound`; no se expone si el recurso existe.
- No hay acción de interfaz para cambiar de workspace sin una membresía válida.

## Happy path

```gherkin
Scenario: Consultar recursos de una aplicación propia
  Given que pertenezco al workspace de una aplicación
  When consulto sus workflows o modelos
  Then el sistema devuelve únicamente los recursos de esa aplicación
```

## Bad path

```gherkin
Scenario: Consultar recursos de una aplicación ajena
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus workflows o modelos usando su identificador
  Then el sistema rechaza la solicitud por falta de permisos
  And no revela si los recursos existen
```

```gherkin
Scenario: SDK con credencial de otra aplicación
  Given que un SDK usa una credencial emitida para una aplicación
  When solicita sincronizar recursos de otra aplicación o workspace
  Then el servidor rechaza la solicitud
  And no entrega workflows, modelos ni manifiestos ajenos
```

## Criterios de aceptación

- Toda consulta de recursos valida el workspace y la aplicación propietaria.
- Un usuario solo accede a recursos de workspaces donde es miembro.
- Una credencial SDK solo sincroniza recursos de su aplicación.
- Las respuestas no autorizadas no revelan la existencia de recursos ajenos.
- El aislamiento se aplica igual a workflows, modelos, manifiestos y versiones.
