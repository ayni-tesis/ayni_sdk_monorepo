# US-135 — Buscar destinos desde la página inicial

**Épica:** Página inicial para desarrolladores

## Historia de usuario

Como desarrollador en la página inicial, quiero buscar entre los destinos disponibles para llegar rápidamente al registro, al dashboard o a la explicación del workflow.

## Interfaz

### Ubicación

Control de búsqueda de la navegación principal de `/`; diálogo modal asociado.

### Elementos y texto visible

- Botón: `Buscar en Ayni`; atajo indicado: Ctrl o Command + K.
- Diálogo: `Buscar en Ayni`.
- Campo etiquetado: `Buscar una página`.
- Destinos: `Crear un workspace`, `Ir al dashboard` y `Cómo funciona`.
- Estado sin coincidencias: `No se encontraron páginas. Prueba “dashboard” o “workspace”.` (adaptar sugerencias al español).
- Ayuda de teclado y acción `Cerrar`.

**Estado actual:** el diálogo con nombre accesible y los tres destinos existe en inglés. El filtrado, el atajo, foco, Escape y reinicio al cerrar están en la implementación; las pruebas actuales solo cubren el nombre accesible, no estas interacciones.

### Estados y mensajes

- Al abrir: el diálogo modal se muestra y el foco pasa al campo.
- Al escribir: los destinos coincidentes se filtran por etiqueta y descripción.
- Sin coincidencias: se informa que no hay resultados y se sugieren términos.
- Al cerrar: la consulta se limpia; se puede cerrar con Escape, botón de cierre o clic en el fondo.

## Happy path

```gherkin
Scenario: Encontrar el dashboard con la búsqueda
  Given que abro la búsqueda desde la página inicial
  When escribo “dashboard”
  Then se muestra el destino del dashboard
  When selecciono ese resultado
  Then navego a /dashboard y el diálogo se cierra
```

## Bad path

```gherkin
Scenario: Consulta sin resultados
  Given que el diálogo de búsqueda está abierto
  When escribo un término que no coincide con ningún destino
  Then se muestra el estado sin coincidencias
  And no se muestra un resultado navegable incorrecto
```

## Criterios de aceptación

- El diálogo tiene un nombre accesible y el campo una etiqueta asociada.
- Ctrl/Cmd+K y el botón abren el diálogo; el foco llega al campo.
- La consulta filtra únicamente registro, dashboard y sección de workflow.
- Seleccionar un destino navega a la ruta o ancla correcta y cierra el diálogo.
- Cerrar reinicia la consulta; Escape está disponible mediante el comportamiento modal nativo.
- Todos los textos visibles y accesibles están en español.
- El filtrado y reinicio cuentan con pruebas automatizadas.
