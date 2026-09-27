# US-142 — Preparar una aplicación en el dashboard

**Épica:** Documentación del SDK

## Historia de usuario

Como administrador de un workspace, quiero una guía paso a paso del dashboard
para dejar una aplicación lista para que el SDK la sincronice.

## Interfaz

### Ubicación

`Guías` → `Preparar una aplicación en el dashboard`.

### Elementos y texto visible

- Pasos numerados con captura de pantalla y los textos exactos del dashboard:
  1. `Crea una aplicación`.
  2. `Genera una credencial del SDK` y guárdala; aviso `Advertencia`: `La
     credencial se muestra una sola vez.`
  3. `Registra un modelo` y `Sube una versión` `.tflite`.
  4. `Crea un workflow`, agrega los nodos y conéctalos.
  5. `Valida el workflow` y `Publica una versión`.
- Los títulos de los pasos son instrucciones; cada paso cita entre comillas la
  etiqueta exacta del botón del dashboard (por ejemplo `Validar workflow`).
- Cada paso indica el rol necesario (`Administrador`) y enlaza al concepto
  relacionado.
- Cierre: `Tu aplicación está lista. Continúa con el Inicio rápido del SDK.`

### Estados y mensajes

- Cada paso lista los errores frecuentes con el mensaje que muestra el
  dashboard y cómo resolverlo, por ejemplo el rechazo por aplicación archivada.
- Aviso para miembros sin rol de administración: `Necesitas ser administrador
  del workspace para completar esta guía.`

## Happy path

```gherkin
Scenario: Dejar una aplicación lista para el SDK
  Given que soy administrador de un workspace
  When sigo la guía completa
  Then tengo una aplicación con una credencial activa y un workflow publicado
  And puedo continuar con el inicio rápido del SDK
```

## Bad path

```gherkin
Scenario: Intentar la guía como miembro
  Given que pertenezco al workspace sin permisos de administración
  When sigo la guía
  Then la guía me advierte que necesito ser administrador
  And me indica pedir el rol a un administrador
```

## Criterios de aceptación

- Los textos de botones, campos y mensajes coinciden con el dashboard de la
  versión documentada.
- Las capturas usan datos de ejemplo, nunca credenciales ni datos reales.
- Cuando una historia del dashboard cambia un texto o un paso citado, actualiza
  esta guía en el mismo cambio.
- Solo se describen acciones que existen; los pasos del editor visual se
  ajustan a lo implementado de US-120 a US-132.
