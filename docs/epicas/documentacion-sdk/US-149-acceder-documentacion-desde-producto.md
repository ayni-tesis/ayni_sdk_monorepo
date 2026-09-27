# US-149 — Llegar a la documentación desde la landing y el dashboard

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador o administrador, quiero enlaces a la documentación desde la
landing y desde el lugar del dashboard donde la necesito para no buscarla por
separado.

## Interfaz

### Ubicación

- Navegación principal de la landing (`/`).
- Menú de usuario o de ayuda del dashboard.
- Puntos contextuales del dashboard.

### Elementos y texto visible

- Landing: enlace `Documentación` en la navegación principal y como destino del
  diálogo de búsqueda (US-135).
- Dashboard: opción `Documentación` en el menú de ayuda.
- Enlaces contextuales:
  - Diálogo de credencial recién generada: `Cómo usar esta credencial en el
    SDK` → `Inicio rápido`, paso `Guarda la credencial`.
  - Detalle de un workflow publicado: `Ver el esquema de workflow`.
  - Estado vacío de aplicaciones: `Guía: preparar una aplicación`.
- Los enlaces externos abren en una pestaña nueva y lo anuncian con el texto
  accesible `(se abre en una pestaña nueva)`.

### Estados y mensajes

- Sin permisos: los enlaces a la documentación se muestran a todos los roles; la
  documentación es pública.

## Happy path

```gherkin
Scenario: Ir de la credencial al inicio rápido
  Given que soy administrador y acabo de generar una credencial
  When elijo "Cómo usar esta credencial en el SDK"
  Then se abre el inicio rápido en el paso "Guarda la credencial"
  And el diálogo de la credencial sigue abierto en el dashboard
```

## Bad path

```gherkin
Scenario: Destino de documentación inexistente
  Given que una página de documentación enlazada cambia de ruta
  When CI verifica los enlaces del producto
  Then la verificación falla indicando el enlace roto
```

## Criterios de aceptación

- La URL base de la documentación se configura por variable de entorno validada
  en `packages/env`, no se escribe en el código.
- Abrir la documentación no cierra diálogos ni descarta datos del dashboard.
- Los enlaces contextuales apuntan a anclas que existen en el sitio (US-150).
- Los textos están en español.
