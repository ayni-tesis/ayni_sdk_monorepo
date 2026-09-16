# US-013 — Subir una versión TensorFlow Lite de un modelo

**Épica:** Modelos

## Historia de usuario

Como administrador de un workspace, quiero subir un archivo `.tflite` como una
versión de un modelo para que los workflows puedan usar un artefacto de
inferencia concreto.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Modelos` → modelo → `Subir versión`.

### Elementos y texto visible

- Título: `Subir versión de modelo`.
- Campo: `Versión`; selector: `Archivo TensorFlow Lite (.tflite)`.
- Ayuda: `No podrás reemplazar una versión publicada con el mismo identificador.`
- Acciones: `Subir versión` y `Cancelar`.

### Estados y mensajes

- Progreso: `Subiendo modelo…` con porcentaje transferido.
- Éxito: `Versión <versión> subida y verificada.`
- Archivo inválido: `El archivo no es un modelo TensorFlow Lite válido.`
- Duplicado: `Ya existe una versión con este identificador.`

## Happy path

```gherkin
Scenario: Subir una versión válida
  Given que soy administrador del workspace de un modelo TensorFlow Lite
  When subo un archivo .tflite válido con un identificador de versión nuevo
  Then el sistema guarda la versión para ese modelo
  And registra el hash de integridad y el tamaño del archivo
```

## Bad path

```gherkin
Scenario: Subir un archivo que no es TensorFlow Lite
  Given que soy administrador del workspace de un modelo TensorFlow Lite
  When subo un archivo que no supera la validación TensorFlow Lite
  Then el sistema rechaza el archivo
  And no crea una versión de modelo
```

```gherkin
Scenario: Reutilizar un identificador de versión
  Given que un modelo ya tiene una versión con un identificador
  When intento subir otra versión con el mismo identificador
  Then el sistema informa que la versión ya existe
  And conserva el archivo y metadatos originales
```

```gherkin
Scenario: Usuario sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento subir una versión de modelo
  Then el sistema rechaza la operación por falta de permisos
  And no almacena el archivo
```

## Criterios de aceptación

- Solo los administradores del workspace pueden subir versiones de modelo.
- Una versión pertenece a un único modelo de la misma aplicación.
- El archivo debe superar la validación del formato TensorFlow Lite.
- Cada versión registra un hash criptográfico de integridad y el tamaño del archivo.
- El identificador de versión es único dentro de un modelo y una versión existente
  no se sobrescribe.
