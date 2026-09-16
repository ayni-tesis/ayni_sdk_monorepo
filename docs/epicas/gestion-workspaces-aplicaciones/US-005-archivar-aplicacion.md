# US-005 — Archivar una aplicación

**Épica:** Gestión de workspaces y aplicaciones

## Historia de usuario

Como administrador de un workspace, quiero archivar una aplicación que ya no
uso para retirarla de las operaciones activas sin perder su historial.

## Interfaz

### Ubicación

Dashboard → Aplicación activa → menú `Acciones` → `Archivar aplicación`.

### Elementos y texto visible

- Diálogo de confirmación: `¿Archivar "<nombre>"?`.
- Aviso: `La aplicación dejará de sincronizar recursos nuevos. Sus workflows y modelos se conservarán.`
- Acciones: `Archivar aplicación` y `Cancelar`.

### Estados y mensajes

- Mientras se archiva: `Archivando aplicación…`.
- Éxito: `Aplicación archivada.`
- Sin permisos: `No tienes permiso para archivar esta aplicación.`
- En la lista activa deja de aparecer; en detalle se muestra la etiqueta `Archivada`.

## Happy path

```gherkin
Scenario: Archivar una aplicación activa
  Given que soy administrador del workspace de una aplicación activa
  When confirmo que deseo archivarla
  Then el sistema cambia su estado a archivada
  And deja de mostrarla en la lista de aplicaciones activas
  And conserva sus workflows y modelos
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento archivar una aplicación
  Then el sistema rechaza la operación por falta de permisos
  And la aplicación conserva su estado
```

```gherkin
Scenario: Sincronizar una aplicación archivada
  Given que una aplicación está archivada
  When un SDK intenta sincronizar sus recursos
  Then el servidor rechaza la sincronización con el estado applicationArchived
  And no entrega nuevas versiones de workflows ni modelos
```

## Criterios de aceptación

- Solo los administradores del workspace pueden archivar una aplicación.
- Archivar no elimina workflows, modelos, versiones ni registros históricos.
- Una aplicación archivada no aparece entre las aplicaciones activas.
- El servidor no permite nuevas sincronizaciones con una aplicación archivada.
- Los recursos ya guardados en un dispositivo no pueden retirarse de forma
  retroactiva mientras este permanezca sin conexión.
