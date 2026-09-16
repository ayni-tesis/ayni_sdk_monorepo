# US-099 — Publicar un ejemplo de integración

**Épica:** Empaquetado y distribución del SDK

## Historia de usuario

Como desarrollador Flutter, quiero un proyecto de ejemplo que use el paquete para verificar rápidamente una integración real.

## Interfaz

El ejemplo muestra `Configura tu credencial y endpoint de prueba antes de ejecutar.`; con configuración válida muestra `SDK inicializado`, `Sincronización completada` y el resultado del workflow.

## Happy path

```gherkin
Scenario: Ejecutar el ejemplo en una plataforma compatible
  Given que instalé las dependencias del proyecto de ejemplo
  When lo ejecuto en un dispositivo compatible
  Then puede inicializar el SDK y mostrar el resultado de un workflow de ejemplo
```

## Bad path

```gherkin
Scenario: Ejecutar el ejemplo sin configuración
  Given que el ejemplo requiere una credencial o endpoint de prueba
  When se ejecuta sin esa configuración
  Then muestra una instrucción de configuración clara
  And no expone secretos de prueba
```

## Criterios de aceptación

- El ejemplo depende solo de la API pública del paquete.
- El ejemplo no contiene credenciales reales.
- El ejemplo verifica inicialización, sincronización y ejecución.
