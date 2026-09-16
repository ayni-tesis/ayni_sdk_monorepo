# US-021 — Definir el contrato de una versión de modelo

**Épica:** Modelos

## Historia de usuario

Como administrador de un workspace, quiero definir las entradas y salidas de
una versión de modelo para que el editor y el SDK puedan conectarla de forma
segura en un workflow DAG.

## Interfaz

### Ubicación

Dashboard → Modelo → versión → `Contrato de entradas y salidas`.

### Elementos y texto visible

- Título: `Contrato de la versión <versión>`.
- Selector `Tipo de tarea`: `Clasificación` o `Detección`.
- Para imagen: campos `Ancho`, `Alto`, `Canales` y `Normalización`.
- Acciones: `Guardar contrato` y `Cancelar`.

### Estados y mensajes

- Éxito: `Contrato guardado.`
- Incompatible: `El contrato no es compatible con TensorFlow Lite.`
- Sin permisos: `No tienes permiso para editar el contrato de esta versión.`

## Happy path

```gherkin
Scenario: Definir contrato de clasificación de imagen
  Given que soy administrador del workspace de una versión TensorFlow Lite
  When registro que recibe una imagen y devuelve etiquetas con confianza
  Then el sistema guarda el contrato asociado a esa versión
  And permite validar nodos de workflow contra ese contrato
```

## Bad path

```gherkin
Scenario: Registrar un contrato incompatible con el runtime
  Given que una versión es de TensorFlow Lite
  When intento registrar un contrato no admitido por ese runtime
  Then el sistema rechaza el contrato
  And no modifica el contrato existente
```

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento definir el contrato de una versión
  Then el sistema rechaza la operación
  And no modifica la versión
```

## Criterios de aceptación

- El contrato define los tipos de entrada y salida de una versión concreta.
- El primer contrato admite imagen de entrada y resultados de clasificación o detección.
- Solo los administradores pueden definir o modificar el contrato.
- Un contrato inválido o incompatible no queda guardado.
