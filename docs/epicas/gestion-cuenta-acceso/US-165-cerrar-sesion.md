# US-165 — Cerrar sesión

**Épica:** Gestión de cuenta y acceso

## Historia de usuario

Como persona con una sesión iniciada, quiero cerrar sesión explícitamente para dejar de usar Ayni en este navegador.

## Interfaz

### Ubicación

Acción de cierre de sesión en el menú de usuario autenticado.

### Elementos y texto visible

- Acción `Cerrar sesión` visible cuando existe una sesión.
- Destino público posterior al cierre, actualmente `/`.

**Estado actual:** el menú actual ejecuta `authClient.signOut` y navega a `/` si el servidor confirma el cierre. Véase `apps/web/src/components/user-menu.tsx`.

### Estados y mensajes

- Menú de usuario disponible mientras hay sesión.
- Cierre en curso: se evita repetir la acción mientras se procesa.
- Éxito: la sesión deja de estar disponible en la interfaz y se muestra la página pública.
- Error: se conserva el estado autenticado hasta confirmar el cierre y se permite volver a intentarlo.

## Happy path

```gherkin
Scenario: Cerrar la sesión actual
  Given que tengo una sesión iniciada en Ayni
  When selecciono “Cerrar sesión”
  And el cierre es confirmado
  Then dejo de ver las opciones autenticadas
  And vuelvo a una página pública
```

## Bad path

```gherkin
Scenario: Mantener el estado si falla el cierre
  Given que tengo una sesión iniciada en Ayni
  When el servidor no puede confirmar el cierre de sesión
  Then no se muestra una sesión cerrada como si hubiera tenido éxito
  And puedo volver a intentar cerrar sesión
```

## Criterios de aceptación

- La acción solo se presenta como cierre de la sesión actual de una persona autenticada.
- La interfaz no comunica éxito ni navega como si el cierre hubiera terminado antes de recibir confirmación.
- Tras el éxito, la interfaz refleja el estado sin sesión y dirige a una ruta pública.
- Un fallo conserva una presentación coherente con la sesión existente y ofrece reintentar sin crear sesiones nuevas.
- El alcance se limita a la sesión actual; administrar o cerrar sesiones en otros dispositivos queda fuera de esta épica.

