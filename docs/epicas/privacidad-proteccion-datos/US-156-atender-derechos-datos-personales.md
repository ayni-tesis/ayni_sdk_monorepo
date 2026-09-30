# US-156 — Solicitar y gestionar derechos sobre datos personales

**Épica:** Privacidad y protección de datos personales

## Historia de usuario

Como titular de datos personales, quiero encontrar un canal para solicitar
acceso, actualización, rectificación, cancelación, oposición o portabilidad y
conocer el estado de mi solicitud.

## Interfaz

### Ubicación

En el aviso de privacidad y en `Privacidad` de la aplicación correspondiente.

### Elementos y texto visible

- Tipos de solicitud: `Acceso`, `Actualización o rectificación`, `Cancelación`,
  `Oposición` y `Portabilidad` cuando aplique.
- Formulario que solicita solo los datos necesarios para verificar y atender la
  solicitud; identifica al responsable y su canal de contacto.
- Estado: `Recibida`, `En revisión`, `Respondida` o `No procede` con explicación.

### Estados y mensajes

- Éxito: `Solicitud recibida. Guarda este número para consultar su estado.`
- Error: `No pudimos registrar la solicitud. Inténtalo nuevamente o usa el
  canal de contacto del responsable.`
- Sin permisos: una persona no puede consultar solicitudes de otra.

## Happy path

```gherkin
Scenario: Registrar una solicitud de acceso
  Given que soy titular de los datos tratados por una aplicación
  When envío una solicitud de acceso por su canal publicado
  Then la solicitud queda vinculada al responsable correcto
  And puedo consultar su estado y recibir una respuesta por ese canal
```

## Bad path

```gherkin
Scenario: Solicitud enviada a la organización equivocada
  Given que el dato pertenece a una aplicación cliente y no a una cuenta Ayni
  When contacto el canal de privacidad de Ayni
  Then recibo orientación al canal publicado por el responsable de esa aplicación
  And Ayni no revela datos de otra organización
```

## Criterios de aceptación

- Los canales distinguen solicitudes relativas a una cuenta Ayni de las
  relativas a usuarios de una aplicación cliente.
- La persona puede ejercer los derechos previstos que apliquen a sus datos; el
  sistema permite aportar información adicional solo cuando resulte necesaria.
- Se registra responsable, fecha, tipo, estado y respuesta, con acceso
  restringido y trazabilidad.
- Los plazos, identidad requerida, excepciones y formatos de respuesta se
  configuran tras validar el reglamento vigente; la interfaz no promete un
  plazo genérico que pueda ser incorrecto.
- Una denegación comunica el motivo y el canal de reclamación que corresponda.
