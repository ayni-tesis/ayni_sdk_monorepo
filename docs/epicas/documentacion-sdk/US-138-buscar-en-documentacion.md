# US-138 — Buscar en la documentación

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador que integra el SDK, quiero buscar un término, una clase o un
código de error para llegar directo a la página que lo explica.

## Interfaz

### Ubicación

Campo `Buscar` del encabezado del sitio; se abre también con `Ctrl`/`Cmd` + `K`
y con `/`.

### Elementos y texto visible

- Diálogo con el campo `Buscar en la documentación`; ayuda: `Escribe una
  clase, un concepto o un código de error.`
- Cada resultado muestra el título de la página, la sección y un fragmento con
  el término resaltado.
- Pie del diálogo: `↑↓ para moverte · Enter para abrir · Esc para cerrar`.

### Estados y mensajes

- Carga: `Buscando…`.
- Vacío antes de escribir: `Escribe para buscar.`
- Sin resultados: `No hay resultados para «<término>». Prueba con otra palabra
  o revisa la referencia de la API.`
- Error al cargar el índice: `No pudimos cargar la búsqueda. Usa la barra
  lateral o vuelve a intentarlo.`
- Sin permisos: no aplica.

## Happy path

```gherkin
Scenario: Encontrar un estado del SDK
  Given que estoy en cualquier página de la documentación
  When pulso Ctrl+K y escribo "upToDate"
  Then veo la página de estados y errores entre los resultados
  And al pulsar Enter abro la página en la sección de ese estado
```

## Bad path

```gherkin
Scenario: Término sin coincidencias
  Given que abrí la búsqueda
  When escribo un término que no aparece en ninguna página
  Then veo "No hay resultados para «<término>»."
```

```gherkin
Scenario: Falla el índice de búsqueda
  Given que el índice de búsqueda no se puede cargar
  When abro la búsqueda
  Then veo "No pudimos cargar la búsqueda."
  And la navegación por la barra lateral sigue disponible
```

## Criterios de aceptación

- El índice cubre guías, conceptos y ambas referencias (Dart y HTTP), incluidos
  los nombres de clases, enums y códigos de error.
- La búsqueda es de texto completo, no distingue mayúsculas ni tildes y no
  depende de un servicio externo de pago. Usa la búsqueda integrada de
  Starlight (Pagefind), que se sirve como archivos estáticos desde Vercel.
- Se comprueba que el índice incluye la referencia Dart generada por
  `dart doc` (US-143) y la referencia HTTP (US-144). Si Pagefind no indexa esas
  páginas, se agregan al índice por configuración.
- El índice se genera en la compilación; una página nueva aparece sin pasos
  manuales.
- El diálogo se opera solo con teclado y devuelve el foco al cerrarse.
