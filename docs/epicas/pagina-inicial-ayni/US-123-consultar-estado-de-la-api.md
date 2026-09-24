# US-123 — Consultar el estado de la API

**Épica:** Página inicial para desarrolladores

## Historia de usuario

Como desarrollador que evalúa Ayni, quiero consultar si la API responde para distinguir una conexión disponible de una interrupción del servicio.

## Interfaz

### Ubicación

Indicador de estado bajo las acciones principales de la sección de introducción en `/`.

### Elementos y texto visible

- Etiqueta: `Estado de la API`.
- Estado inicial: `Comprobando…`.
- Respuesta HTTP exitosa: `Conectada`.
- Error de red o respuesta no exitosa: `Desconectada`.

**Estado actual:** el indicador consulta `${NEXT_PUBLIC_SERVER_URL}/health` y presenta los estados equivalentes en inglés. No hay reintento automático ni detalle técnico del error.

### Estados y mensajes

- Carga: `Comprobando…`.
- Éxito: `Conectada` cuando la respuesta HTTP es exitosa.
- Error: `Desconectada` ante una respuesta no exitosa o error de red.
- Sin permisos: no aplica; la comprobación es pública.

## Happy path

```gherkin
Scenario: La API responde
  Given que se carga la página inicial
  When la API responde exitosamente a GET /health
  Then el indicador muestra “Conectada”
```

## Bad path

```gherkin
Scenario: La API no responde
  Given que se carga la página inicial
  When GET /health falla o devuelve una respuesta no exitosa
  Then el indicador muestra “Desconectada”
  And la página inicial permanece disponible
```

## Criterios de aceptación

- La comprobación usa el endpoint `/health` del servidor configurado.
- Se distinguen comprobando, conectada y desconectada.
- El fallo de salud no bloquea la navegación ni oculta el contenido de la página.
- El indicador comunica el cambio de estado a tecnologías de asistencia.
- Los estados se presentan en español.
