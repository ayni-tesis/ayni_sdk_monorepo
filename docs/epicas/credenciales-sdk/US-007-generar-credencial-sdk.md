# US-007 — Generar una credencial SDK

**Épica:** Credenciales SDK

## Historia de usuario

Como administrador de un workspace, quiero generar una credencial para una
aplicación activa para que su SDK pueda autenticarse al sincronizar recursos.

## Interfaz

### Ubicación

Dashboard → Aplicación → `Credenciales SDK` → `Generar credencial`.

### Elementos y texto visible

- Diálogo: `Generar credencial SDK`.
- Aviso: `El secreto se mostrará una sola vez. Guárdalo en un lugar seguro.`
- Acción principal: `Generar credencial`; secundaria: `Cancelar`.
- Tras crearla, pantalla de éxito: `Copia tu credencial ahora. No podrás verla nuevamente.` y acción `Copiar credencial`.

### Estados y mensajes

- Carga: `Generando credencial…`.
- Éxito: `Credencial generada.`
- Aplicación archivada: `No puedes generar credenciales para una aplicación archivada.`
- Sin permisos: `No tienes permiso para administrar credenciales.`

## Happy path

```gherkin
Scenario: Generar una credencial para una aplicación activa
  Given que soy administrador del workspace de una aplicación activa
  When solicito generar una credencial SDK
  Then el sistema crea una credencial vinculada únicamente a esa aplicación
  And muestra el secreto una sola vez para que pueda guardarlo
```

## Bad path

```gherkin
Scenario: Miembro sin permisos de administración
  Given que pertenezco al workspace sin permisos de administración
  When intento generar una credencial SDK
  Then el sistema rechaza la operación por falta de permisos
  And no crea una credencial
```

```gherkin
Scenario: Generar una credencial para una aplicación archivada
  Given que una aplicación está archivada
  When intento generar una credencial SDK para ella
  Then el sistema rechaza la operación con el estado applicationArchived
  And no crea una credencial
```

## Criterios de aceptación

- Solo un administrador del workspace puede generar credenciales.
- Una credencial pertenece a una única aplicación activa.
- El secreto se muestra solo durante su creación y no se almacena en texto plano.
- La credencial permite solicitar únicamente recursos de su aplicación.
- No se emiten credenciales nuevas para aplicaciones archivadas.
