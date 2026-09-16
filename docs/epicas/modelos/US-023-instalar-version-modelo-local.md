# US-023 — Instalar una versión de modelo localmente

**Épica:** Modelos

## Historia de usuario

Como SDK, quiero instalar una versión de modelo cuya integridad fue verificada
para que un workflow pueda ejecutarla sin conexión.

## Interfaz

### Ubicación

Proceso interno del SDK; la app lo recibe dentro del resultado de sincronización.

### Elementos y texto visible

- Estado por versión: `Instalando`, `Disponible offline` o `No disponible`.
- La app puede mostrar `Modelo <versión> listo para usarse sin conexión.`

### Estados y mensajes

- Espacio insuficiente: `No hay espacio suficiente para instalar el modelo.`
- Archivo no verificado: `El modelo no superó la verificación de integridad.`
- Éxito: `Modelo <versión> disponible offline.`

## Happy path

```gherkin
Scenario: Instalar un modelo verificado
  Given que el SDK tiene un archivo de modelo con integridad válida
  When lo instala en el almacenamiento local de la aplicación
  Then registra la versión como disponible para ejecución offline
```

## Bad path

```gherkin
Scenario: Espacio insuficiente en el dispositivo
  Given que el SDK tiene un archivo de modelo con integridad válida
  When intenta instalarlo sin espacio de almacenamiento suficiente
  Then informa un error de almacenamiento
  And conserva cualquier versión local válida anterior
```

```gherkin
Scenario: Instalar un archivo no verificado
  Given que el SDK tiene un archivo sin verificación de integridad satisfactoria
  When intenta instalarlo
  Then rechaza la instalación
  And no marca la versión como disponible
```

## Criterios de aceptación

- Solo una versión con integridad válida puede instalarse para ejecución.
- La instalación registra modelo, versión y hash asociados.
- Un fallo de instalación no reemplaza una versión local válida.
- Un workflow puede consultar si su versión requerida está disponible localmente.
