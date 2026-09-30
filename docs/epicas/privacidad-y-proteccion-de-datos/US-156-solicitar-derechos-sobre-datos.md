# US-156 — Solicitar y gestionar derechos sobre datos personales

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como titular de datos personales, quiero encontrar el canal para solicitar
acceso, actualización o rectificación, cancelación, oposición y, cuando aplique,
portabilidad, y conocer el estado de mi solicitud.

## Alcance

- Las solicitudes sobre una cuenta de Ayni corresponden al responsable del
  tratamiento de esa cuenta.
- Las solicitudes de usuarios finales de una aplicación cliente se dirigen al
  responsable que esa aplicación identifica en su aviso. Ayni no las recibe en
  nombre de la aplicación ni revela datos de otra organización.
- El canal publicado debe identificar al responsable y permitir aportar solo la
  información necesaria para verificar y atender la solicitud.
- El registro debe conservar responsable, fecha, tipo de derecho, estado y
  respuesta con acceso restringido y trazabilidad.
- Los estados son `Recibida`, `En revisión`, `Respondida` y `No procede`. Una
  denegación explica el motivo y el canal de reclamación aplicable.
- La persona puede aportar información adicional solo cuando sea necesaria.

## Interfaz

### Ubicación

En el aviso de privacidad y en `Privacidad` de la cuenta o aplicación
correspondiente.

### Elementos y texto visible

- Tipos de solicitud: `Acceso`, `Actualización o rectificación`,
  `Cancelación`, `Oposición` y `Portabilidad` cuando aplique.
- Formulario con los datos mínimos para verificar y atender la solicitud; debe
  identificar al responsable y su canal de contacto.
- Estado de la solicitud: `Recibida`, `En revisión`, `Respondida` o `No procede`
  con explicación.

### Estados y mensajes

- Éxito: `Solicitud recibida. Guarda este número para consultar su estado.`
- Error: `No pudimos registrar la solicitud. Inténtalo nuevamente o usa el
  canal de contacto del responsable.`
- Sin permisos: una persona no puede consultar solicitudes de otra.

## Happy path

```gherkin
Scenario: Registrar una solicitud de acceso
  Given que soy titular de datos tratados por una aplicación
  When envío una solicitud de acceso por el canal de su responsable
  Then la solicitud queda vinculada al responsable correcto
  And puedo consultar su estado y recibir respuesta por ese canal
```

## Bad path

```gherkin
Scenario: Solicitud dirigida a la organización equivocada
  Given que los datos corresponden a una aplicación cliente y no a una cuenta Ayni
  When contacto el canal de privacidad de Ayni
  Then recibo orientación al canal publicado por el responsable de esa aplicación
  And Ayni no revela datos de otra organización
```

## Criterios de aceptación

- Los canales distinguen solicitudes relativas a una cuenta Ayni de las
  relativas a usuarios de una aplicación cliente.
- Se pueden ejercer los derechos que correspondan a los datos y al responsable.
- No se piden documentos, identificadores u otros datos personales salvo que
  sean necesarios para verificar identidad y atender la solicitud.
- Los plazos, identidad requerida, excepciones y formatos de respuesta se
  configuran tras validar el reglamento vigente; la interfaz no promete un plazo
  genérico.
- El acceso a las solicitudes y sus respuestas está restringido y auditado.
- La publicación de un canal por una aplicación no constituye validación legal
  de Ayni.

## Estado actual

El aviso publicado por una aplicación cliente muestra el canal de derechos que
declara su administrador. El SDK no registra solicitudes, consulta su estado ni
las reenvía. El formulario y el registro de atención de esta historia aún no
están implementados. El aviso de privacidad de las cuentas Ayni sigue en
borrador mientras se confirman la entidad responsable y su canal de contacto.

## Revisión legal antes de producción

Validar derechos aplicables, plazos, verificación de identidad, excepciones,
canales de reclamación y responsabilidades frente a encargados con asesoría
legal antes de ofrecer el flujo para cuentas Ayni o aplicaciones cliente.
