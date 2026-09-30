# US-157 — Gestionar incidentes que involucren datos personales

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como responsable de privacidad u operaciones de Ayni, quiero registrar,
clasificar y dar seguimiento a incidentes que puedan involucrar datos
personales, para evaluar las notificaciones y coordinaciones que correspondan
por la normativa vigente y los acuerdos con cada aplicación.

## Interfaz

### Ubicación

Consola interna de operaciones → `Incidentes de privacidad`.

### Elementos y texto visible

- Fecha y hora en que Ayni tomó conocimiento del incidente.
- Sistemas y aplicaciones afectados, categorías de datos, volumen aproximado,
  impacto, acciones de contención y contactos responsables.
- Evaluación documentada de si corresponde notificar a la ANPD, al Centro
  Nacional de Seguridad Digital, a las personas afectadas o al cliente.
- Acciones `Registrar evaluación` y `Registrar notificación`, que guardan hora,
  destinatario y evidencia de cada acción.
- Alertas al punto de contacto responsable al acercarse un plazo aplicable,
  configuradas solo después de validar el procedimiento y los roles.

### Estados y mensajes

- Estados: `En evaluación`, `En atención`, `Notificado` y `Cerrado`.
- Error: `No pudimos guardar el incidente.`
- Acceso limitado al personal autorizado.

## Happy path

```gherkin
Scenario: Evaluar un incidente con datos personales
  Given que operaciones detecta un incidente que puede afectar datos personales
  When registra los hechos y evalúa el alcance y las responsabilidades
  Then queda una evaluación trazable con las acciones y notificaciones aplicables
```

## Bad path

```gherkin
Scenario: Se acerca un plazo aplicable sin evaluación completa
  Given que el responsable conoce un incidente posiblemente notificable
  When se acerca el plazo legal aplicable configurado para el procedimiento
  Then el sistema alerta al punto de contacto responsable
  And conserva el motivo documentado si la notificación se retrasa
```

## Criterios de aceptación

- El expediente registra hora de conocimiento, hechos, evaluación, decisión,
  responsables, destinatarios, notificaciones y evidencia de cada acción.
- La evaluación aplica los supuestos vigentes del D.S. N.º 016-2024-JUS,
  incluido su artículo 34, después de revisión legal. No notifica
  automáticamente todo incidente ni sustituye el juicio del responsable.
- Cuando Ayni actúe como encargado, comunica el incidente al responsable de la
  aplicación afectada según el contrato y el procedimiento definido.
- El acceso al expediente se limita por rol y toda consulta o cambio queda
  registrado.
- Los plazos y alertas se configuran a partir del procedimiento validado; el
  producto no promete un plazo genérico ni decide por sí mismo que una
  notificación es obligatoria.
- La configuración del proceso refleja los roles reales de Ayni y de cada
  aplicación.

## Estado actual

No existe una consola ni un registro de incidentes de privacidad en el producto.
Esta historia define el flujo requerido; no afirma que Ayni ya registre,
clasifique, notifique o alerte sobre incidentes.

## Revisión legal y operativa antes del lanzamiento

Validar el procedimiento frente al [artículo 34 del Reglamento de la Ley
N.° 29733, aprobado por D.S. N.° 016-2024-JUS](https://www.gob.pe/institucion/anpd/normas-legales/6554453-n-016-2024-jus),
las condiciones de notificación, los plazos, el rol de Ayni en cada tratamiento,
los acuerdos con clientes y los contactos de respuesta. No habilitar alertas ni
notificaciones automáticas hasta confirmar esas reglas con asesoría legal y
operaciones.
