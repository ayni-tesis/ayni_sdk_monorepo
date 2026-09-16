# US-090 — Definir la API pública del SDK

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero una API pública pequeña y estable para inicializar, sincronizar y ejecutar workflows.

## Interfaz

Import: `package:ayni_sdk/ayni_sdk.dart`; API visible `AyniSdk.initialize`, `sync`, `run` y tipos `WorkflowResult`/`WorkflowError`. El README dice `No importes archivos src internos.`

## Happy path

```gherkin
Scenario: Usar una API pública
  Given que instalé ayni_sdk
  When importo su librería pública
  Then puedo inicializar, sincronizar y ejecutar sin importar archivos internos
```

## Bad path

```gherkin
Scenario: Importar una API interna
  Given que una clase es interna al SDK
  When una aplicación intenta depender de ella
  Then el paquete no la expone como parte de su API pública
```

## Criterios de aceptación

- La API pública incluye inicialización, sincronización, ejecución y tipos de resultado/error.
- Las clases internas no forman parte del contrato de integración.
- La API no requiere que la app interprete el JSON del DAG.
