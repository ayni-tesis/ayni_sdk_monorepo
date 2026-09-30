# US-157 — Gestionar incidentes que involucren datos personales

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como responsable de privacidad u operaciones de Ayni, quiero registrar,
clasificar y dar seguimiento a incidentes que puedan involucrar datos
personales, para evaluar las notificaciones y coordinaciones exigidas por la
normativa y por los acuerdos con cada aplicación.

## Interfaz

### Ubicación

Consola interna de operaciones → `Incidentes de privacidad`.

### Elementos y texto visible

- Fecha de conocimiento, sistemas y aplicaciones afectadas, categorías de
  datos, volumen aproximado, impacto, acciones de contención y contactos
  responsables.
- Evaluación documentada de si corresponde notificar a la ANPD, al Centro
  Nacional de Seguridad Digital, a las personas afectadas o al cliente.
- Acciones `Registrar evaluación` y `Registrar notificación` con marca de
  tiempo, destinatario y evidencia.

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
Scenario: Incidente sin evaluación dentro del plazo aplicable
  Given que el responsable conoce un incidente posiblemente notificable
  When se acerca el plazo legal aplicable
  Then el sistema alerta al punto de contacto responsable
  And conserva el motivo documentado si la notificación se retrasa
```

## Criterios de aceptación

- El flujo registra hora de conocimiento, hechos, decisión, responsables,
  destinatarios y evidencia de cada acción.
- La evaluación aplica los supuestos vigentes del D.S. N.º 016-2024-JUS;
  no notifica automáticamente todo incidente ni sustituye el juicio legal.
- Cuando Ayni actúe como encargado, el incidente se comunica al responsable de
  la aplicación afectada según el contrato y el procedimiento definido.
- El acceso al expediente se limita por rol y toda consulta o cambio queda
  registrado.
- El procedimiento se valida frente al artículo 34 del reglamento vigente y
  los roles reales de Ayni antes del lanzamiento.
