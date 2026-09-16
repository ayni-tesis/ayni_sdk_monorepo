# Formato de historias de usuario

Cada historia describe un comportamiento verificable y, cuando corresponde, la
interfaz que lo hace posible. No basta con describir la acción del sistema:
debe quedar claro qué muestra el dashboard, qué acción realiza la persona y qué
mensaje recibe.

## Estructura obligatoria

```markdown
# US-NNN — Título orientado a una acción

**Épica:** Nombre de la épica

## Historia de usuario

Como <rol>, quiero <acción> para <beneficio>.

## Interfaz

### Ubicación

<ruta, pantalla o contexto de la app móvil/SDK>

### Elementos y texto visible

- Título: `…`.
- Campo: `…`; ayuda: `…`.
- Acción principal: `…`.
- Acción secundaria: `…`.

### Estados y mensajes

- Carga: `…`.
- Vacío: `…`.
- Éxito: `…`.
- Error: `…`.
- Sin permisos: `…`.

## Happy path

```gherkin
...
```

## Bad path

```gherkin
...
```

## Criterios de aceptación

- ...
```

## Reglas de interfaz

- Las acciones visibles deben usar verbos concretos: `Crear aplicación`,
  `Publicar versión`, `Descargar exportación`; no solo `Guardar` cuando la
  acción puede ser ambigua.
- Cada operación asíncrona debe describir carga, éxito y error.
- Cada lista debe describir estado vacío y datos mínimos por fila.
- Las operaciones destructivas o irreversibles deben pedir confirmación y
  explicar la consecuencia.
- Un error debe explicar qué puede hacer la persona. Los códigos internos como
  `credentialRevoked` pueden existir en la API, pero la interfaz debe mostrar
  un texto comprensible, por ejemplo: `La credencial fue revocada. Genera una
  nueva credencial para continuar.`
- Para historias internas del SDK, **Interfaz** describe la API pública, el
  resultado tipado y el comportamiento visible para la app anfitriona; no se
  inventa una pantalla inexistente.
- Los textos de privacidad deben indicar explícitamente cuando se recolectan
  imágenes, telemetría o datos técnicos del dispositivo.

## Roles actuales

- **Administrador:** crea, edita, publica, archiva y configura recursos de una
  aplicación.
- **Miembro:** consulta recursos del workspace y revisa/anota ítems de dataset.

No existe un rol independiente llamado `revisor` en el alcance actual.
