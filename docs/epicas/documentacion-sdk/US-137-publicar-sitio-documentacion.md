# US-137 — Publicar el sitio de documentación

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador Flutter que evalúa Ayni, quiero un sitio de documentación
con navegación por secciones para encontrar la información sin leer el código
fuente.

## Interfaz

### Ubicación

Aplicación de documentación del monorepo (propuesta: `apps/docs`), desplegada
en su propio dominio o subruta pública.

### Elementos y texto visible

- Encabezado: `Ayni Docs`, campo `Buscar` (US-138), selector de tema y enlace
  `GitHub`.
- Portada: título `Documentación de Ayni`, descripción `Orquesta workflows de
  IA en el dispositivo para apps Flutter, con ejecución offline.` y tarjetas
  `Inicio rápido`, `Conceptos`, `Referencia de la API` y `Notas de versión`.
- Barra lateral en cinco grupos: `Comenzar`, `Guías`, `Conceptos`,
  `Referencia` y `Recursos`.
- En cada página: migas de pan, título, tabla `En esta página`, enlaces
  `Anterior` y `Siguiente`, enlace `Editar esta página` y fecha `Última
  actualización`.
- Bloques de código con botón `Copiar` que cambia a `Copiado`.
- Avisos `Nota`, `Advertencia` y `Peligro`.
- Selector de tema: `Claro`, `Oscuro` y `Sistema`.

### Estados y mensajes

- Página inexistente: `No encontramos esta página.` con enlaces `Ir al inicio`
  y `Buscar en la documentación`.
- Pantalla estrecha: la barra lateral se pliega en un menú `Menú`.
- Sin permisos: no aplica; el sitio es público.

## Happy path

```gherkin
Scenario: Navegar entre secciones
  Given que abro la portada de la documentación
  When elijo "Inicio rápido" y luego "Siguiente"
  Then veo la página de inicio rápido y después la siguiente página de "Comenzar"
  And la barra lateral marca la página actual
```

```gherkin
Scenario: Copiar un bloque de código
  Given que estoy en una página con un bloque de código
  When pulso "Copiar"
  Then el código queda en el portapapeles y el botón muestra "Copiado"
```

## Bad path

```gherkin
Scenario: Abrir una ruta inexistente
  Given que abro una dirección de la documentación que no existe
  When carga la página
  Then veo "No encontramos esta página."
  And puedo volver al inicio o buscar
```

## Criterios de aceptación

- Un ADR (`docs/adr/0002-…`) registra la herramienta elegida tras un spike que
  instala las versiones concretas y compila en CI; la investigación recomienda
  Fumadocs y deja Starlight como alternativa.
- El sitio se compila con `bun run build` desde la raíz y el paso existente de
  CI lo cubre.
- La navegación tiene los cinco grupos de la investigación y ninguna página
  queda fuera de la barra lateral.
- El diseño usa los tokens de `apps/web` (`tokens.css`, `DESIGN.md`) y respeta
  el tema elegido; el contraste cumple WCAG AA en ambos temas.
- La navegación, la tabla de contenidos y el botón `Copiar` funcionan con
  teclado y tienen nombres accesibles.
- El sitio se ve sin desplazamiento horizontal desde 360 px de ancho.
- Las páginas sin contenido todavía no se publican vacías.
