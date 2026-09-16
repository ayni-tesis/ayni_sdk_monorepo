# US-063 — Configurar la política de recolección

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como administrador, quiero habilitar y configurar la recolección de evidencia de una aplicación para controlar qué imágenes puede enviar el SDK.

## Interfaz

Dashboard → Aplicación → `Privacidad y recolección`. Título `Recolección de evidencia`; interruptor `Permitir captura de imágenes para datasets`, selector `Red permitida` y campos `Tamaño máximo`/`Calidad`. Aviso obligatorio: `Las imágenes se subirán solo desde workflows que incluyan dataset.capture y con consentimiento.` Botones `Guardar política` y `Cancelar`; éxito `Política de recolección actualizada.`

## Happy path

```gherkin
Scenario: Habilitar recolección con una política válida
  Given que soy administrador de una aplicación activa
  When guardo una política con consentimiento, calidad y red permitida
  Then el sistema habilita la recolección para esa aplicación
```

## Bad path

```gherkin
Scenario: Habilitar recolección sin consentimiento
  Given que soy administrador de una aplicación
  When intento habilitar la recolección sin una configuración de consentimiento
  Then el sistema rechaza la política
  And no habilita la recolección
```

## Criterios de aceptación

- Solo administradores pueden configurar la política.
- La política pertenece a una aplicación.
- La recolección exige una configuración explícita de consentimiento.
