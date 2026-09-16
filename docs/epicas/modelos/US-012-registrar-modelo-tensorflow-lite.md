# US-012 — Registrar un modelo TensorFlow Lite

**Épica:** Modelos

## Historia de usuario

Como administrador de un workspace, quiero registrar un modelo TensorFlow Lite
en una aplicación para poder administrar sus versiones y usarlas en workflows.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Modelos` → `Registrar modelo`.

### Elementos y texto visible

- Título: `Registrar modelo`.
- Campo obligatorio: `Nombre del modelo`.
- Campo `Runtime` preseleccionado y no editable: `TensorFlow Lite`.
- Acciones: `Registrar modelo` y `Cancelar`.

### Estados y mensajes

- Carga: `Registrando modelo…`.
- Éxito: `Modelo registrado.`
- Error de nombre: `Ingresa un nombre para el modelo.`
- Aplicación archivada: `No puedes registrar modelos en una aplicación archivada.`

## Happy path

```gherkin
Scenario: Registrar un modelo con datos válidos
  Given que soy administrador del workspace de una aplicación activa
  When registro un modelo con nombre y runtime TensorFlow Lite
  Then el sistema crea el modelo dentro de la aplicación
  And queda disponible para registrar versiones posteriormente
```

## Bad path

```gherkin
Scenario: Registrar un modelo sin nombre
  Given que soy administrador del workspace de una aplicación activa
  When intento registrar un modelo sin nombre
  Then el sistema informa que el nombre es obligatorio
  And no crea el modelo
```

```gherkin
Scenario: Registrar un modelo para una aplicación archivada
  Given que una aplicación está archivada
  When intento registrar un modelo en ella
  Then el sistema rechaza la operación con el estado applicationArchived
  And no crea el modelo
```

```gherkin
Scenario: Usuario sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento registrar un modelo
  Then el sistema rechaza la operación por falta de permisos
  And no crea el modelo
```

## Criterios de aceptación

- Solo los administradores del workspace pueden registrar modelos.
- Un modelo pertenece a una única aplicación activa.
- El nombre y el runtime son obligatorios.
- El primer runtime admitido es TensorFlow Lite.
- Registrar el modelo no publica ni descarga un archivo de modelo.
