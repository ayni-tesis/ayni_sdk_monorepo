# US-141 — Comprender los conceptos de Ayni

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador que evalúa Ayni, quiero entender sus conceptos y cómo se
relacionan para decidir si encaja en mi app y usar el vocabulario correcto.

## Interfaz

### Ubicación

`Comenzar` → `¿Qué es Ayni?` y el grupo `Conceptos`, con una página por tema:
`Workspaces y aplicaciones`, `Credenciales del SDK`, `Modelos y versiones`,
`Workflows DAG` y `Sincronización offline`.

### Elementos y texto visible

- `¿Qué es Ayni?`: diagrama `Dashboard/API → sincronización → SDK Flutter en
  el dispositivo` y la lista de lo que el SDK hace y no hace. Aviso `Nota`: `El
  dashboard no ejecuta los modelos: la inferencia ocurre en el dispositivo.`
- Cada página de concepto contiene una definición, un diagrama o ejemplo, las
  reglas que la persona debe conocer (por ejemplo, `Una versión publicada es
  inmutable.`) y `Términos relacionados`.
- Página `Glosario` con cada término y los términos que se evitan.

### Estados y mensajes

- Un concepto cuya funcionalidad aún no existe no se publica, o se marca con la
  insignia `Próximamente` y sin instrucciones de uso.

## Happy path

```gherkin
Scenario: Entender el ciclo de vida de un workflow
  Given que leo "Workflows DAG" y "Sincronización offline"
  When termino ambas páginas
  Then sé que un workflow se diseña como borrador, se publica como versión inmutable
  And sé que el SDK lo descarga, lo valida y lo conserva para usarlo sin red
```

## Bad path

```gherkin
Scenario: Concepto aún no disponible
  Given que un concepto depende de una funcionalidad no implementada
  When abro la documentación
  Then ese concepto no aparece como disponible
  And no incluye instrucciones que no se puedan seguir
```

## Criterios de aceptación

- Las definiciones y los términos a evitar provienen de `CONTEXT.md` (en inglés),
  traducidos al español; si difieren, o falta un término (hoy faltan la versión
  publicada de un workflow y la sincronización offline), se corrige
  `CONTEXT.md` primero.
- Los conceptos de credencial explican que el secreto se muestra una sola vez,
  que el servidor guarda solo su hash y que revocarlo no borra recursos ya
  instalados en los dispositivos.
- `Sincronización offline` explica la instalación atómica: si una actualización
  falla se conserva la última combinación válida de workflow y modelos.
- Los diagramas tienen texto alternativo equivalente.
