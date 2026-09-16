# US-088 — Descargar una exportación de dataset

**Épica:** Gestión y exportación de datasets

## Historia de usuario

Como administrador, quiero descargar una exportación terminada para usarla fuera de la plataforma.

## Interfaz

La pestaña `Exportaciones` muestra `Formato`, `Generada el`, `Estado` y acción `Descargar`. Estados: `Generando`, `Lista` y `Fallida`; al completar: `Tu exportación está lista para descargarse.` Si no hay acceso, `No encontramos esta exportación.`

## Happy path

```gherkin
Scenario: Descargar una exportación propia
  Given que existe una exportación completada para un dataset de mi aplicación
  When solicito su descarga
  Then el sistema entrega un enlace temporal al archivo de exportación
```

## Bad path

```gherkin
Scenario: Descargar una exportación ajena
  Given que no pertenezco al workspace de un dataset
  When intento descargar su exportación
  Then el sistema rechaza la solicitud
  And no entrega el archivo ni su ubicación
```

## Criterios de aceptación

- Solo miembros autorizados del workspace pueden descargar exportaciones.
- El enlace de descarga es temporal y no público.
- La descarga identifica formato, fecha y versión del dataset exportado.
