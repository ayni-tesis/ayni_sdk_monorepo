# US-121 — Acceder al registro y al dashboard

**Épica:** Página inicial para desarrolladores

## Historia de usuario

Como desarrollador interesado en Ayni, quiero iniciar el registro o abrir el dashboard desde la página inicial para continuar con la acción adecuada.

## Interfaz

### Ubicación

Navegación principal, acciones de introducción y pie de página en `/`.

### Elementos y texto visible

- Acción de registro: `Crear un workspace`, destino `/register`.
- Acción de dashboard: `Ir al dashboard`, destino `/dashboard`.
- La navegación y el pie de página ofrecen destinos equivalentes con etiquetas claras en español.

**Estado actual:** los enlaces a `/register` y `/dashboard` ya existen, con etiquetas en inglés.

### Estados y mensajes

- La página no modifica el estado de autenticación ni muestra estados propios de registro.
- Los estados de registro y dashboard pertenecen a sus rutas respectivas.

## Happy path

```gherkin
Scenario: Ir al registro
  Given que estoy en la página inicial
  When activo “Crear un workspace”
  Then navego a /register
```

```gherkin
Scenario: Abrir el dashboard
  Given que estoy en la página inicial
  When activo “Ir al dashboard”
  Then navego a /dashboard
```

## Bad path

```gherkin
Scenario: Mantener destinos explícitos
  Given que estoy en la página inicial
  When uso la navegación principal o el pie
  Then cada enlace conduce a su ruta correcta
  And ninguna acción aparenta completar el registro en la página inicial
```

## Criterios de aceptación

- Las acciones están disponibles y etiquetadas en español.
- El registro dirige a `/register` y el dashboard a `/dashboard`.
- Las acciones son enlaces navegables y utilizables con teclado.
