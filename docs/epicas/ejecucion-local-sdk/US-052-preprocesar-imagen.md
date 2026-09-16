# US-052 — Preprocesar una imagen para un modelo

**Épica:** Ejecución local del SDK

## Historia de usuario

Como SDK, quiero transformar una imagen según el contrato de un modelo para entregarle un tensor compatible.

## Interfaz

Operación interna; la app recibe `unsupportedInputContract` con `El modelo requiere un formato de imagen que esta versión del SDK no admite.` No modifica ni reemplaza la imagen original.

## Happy path

```gherkin
Scenario: Redimensionar y normalizar una imagen
  Given que un nodo de modelo define el tamaño y formato de imagen requeridos
  When el SDK prepara la entrada
  Then genera un tensor compatible con ese contrato
```

## Bad path

```gherkin
Scenario: Contrato de imagen no admitido
  Given que un nodo exige un formato de imagen no soportado por el SDK
  When el SDK intenta preparar la entrada
  Then devuelve unsupportedInputContract
  And no ejecuta el modelo
```

## Criterios de aceptación

- El preprocesado usa únicamente el contrato de la versión de modelo.
- El SDK no modifica la imagen original proporcionada por la app.
- Un contrato no admitido produce un error tipado.
