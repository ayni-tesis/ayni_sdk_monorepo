# Épica — Privacidad y protección de datos personales

Esta épica define historias para informar a las personas sobre el tratamiento
de sus datos y atender sus decisiones y derechos en Ayni y en las aplicaciones
que integran el SDK. Se basa en la Ley N.º 29733 y el Reglamento aprobado por
el D.S. N.º 016-2024-JUS. No afirma que Ayni cumpla por sí solo todas las
obligaciones: antes de implementar cada flujo se deben confirmar los datos,
finalidades, responsables, encargados, proveedores y transferencias reales.

## Historias

| Historia | Resultado |
| --- | --- |
| [US-151](US-151-identificar-tratamientos-y-responsables.md) | Identificar tratamientos, roles y flujos de datos por aplicación. |
| [US-152](US-152-aceptar-terminos-de-uso.md) | Aceptar y dejar constancia de los términos y condiciones de Ayni. |
| [US-153](US-153-consultar-aviso-de-privacidad.md) | Consultar el aviso de privacidad de Ayni o de una aplicación integrada. |
| [US-154](US-154-otorgar-consentimiento-especifico.md) | Otorgar consentimiento específico para finalidades que lo requieran. |
| [US-155](US-155-revocar-consentimiento.md) | Revocar consentimiento y detener tratamientos opcionales futuros. |
| [US-156](US-156-atender-derechos-datos-personales.md) | Solicitar y gestionar derechos sobre datos personales. |
| [US-157](US-157-gestionar-incidentes-datos-personales.md) | Gestionar incidentes que involucren datos personales. |

## Reglas de alcance

- Aceptar los términos de uso, recibir el aviso de privacidad y consentir una
  finalidad de tratamiento son acciones distintas. El aviso no reemplaza el
  consentimiento cuando este sea la base aplicable.
- No se condiciona una finalidad opcional a la aceptación de términos ni a un
  consentimiento para otra finalidad.
- No se asume que toda finalidad requiera consentimiento; cada flujo debe
  registrar su base aplicable según revisión legal.
- La aplicación que integra el SDK puede tratar datos de sus propios usuarios.
  Ayni debe distinguir esos datos de los de cuentas y workspaces de Ayni y
  hacer visible quién atiende cada solicitud.
- Los requisitos para menores, datos sensibles, transferencias, conservación,
  inscripción de bancos de datos y designación de un Oficial de Datos
  Personales quedan sujetos al mapa de tratamientos y a revisar su aplicabilidad.

## Fuentes

- [Ley N.º 29733 — Ley de Protección de Datos Personales](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf).
- [Reglamento vigente — D.S. N.º 016-2024-JUS](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23).
- [Investigación normativa y notas de alcance](../../investigacion/proteccion-datos-personales-peru.md).
