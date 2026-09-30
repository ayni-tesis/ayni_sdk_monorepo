# Investigación — Protección de datos personales en Perú

Fecha de consulta: 2026-09-30.

Esta nota reúne requisitos legales que pueden orientar historias de usuario de
Ayni sobre condiciones de uso, información de privacidad y tratamiento de datos.
No define qué datos trata Ayni ni sustituye la revisión legal del tratamiento
real, sus responsables, proveedores y flujos.

## Fuentes normativas vigentes

- [Ley N.º 29733, Ley de Protección de Datos Personales (Congreso de la República)](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf).
- [Reglamento de la Ley N.º 29733, D.S. N.º 016-2024-JUS (texto actualizado de El Peruano)](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23).
- [Publicación oficial del D.S. N.º 016-2024-JUS (El Peruano)](https://busquedas.elperuano.pe/dispositivo/SE/2349653-1). El reglamento entró en vigor el 31 de marzo de 2025 y derogó el D.S. N.º 003-2013-JUS.

## Requisitos legales con impacto en historias

### Información y consentimiento son comportamientos distintos

- Antes de recopilar datos, la persona debe recibir información detallada,
  sencilla, expresa, inequívoca y previa sobre finalidades, destinatarios,
  banco de datos y titular, encargado cuando corresponda, campos obligatorios o
  facultativos, transferencias y sus consecuencias, conservación y medios para
  ejercer derechos (Ley, art. 18). En recopilación en línea, una política de
  privacidad fácilmente accesible e identificable puede cumplir el deber de
  información.
- Cuando la base de tratamiento sea el consentimiento, este debe ser libre,
  previo, expreso e inequívoco e informado; la solicitud debe identificar el
  tratamiento y cada finalidad. La publicación de una política informa, pero
  no equivale por sí sola a otorgar consentimiento (Ley, arts. 5, 6 y 13.5;
  Reglamento, arts. 1–5).
- El consentimiento electrónico es posible, incluido hacer clic/tocar, si
  expresa inequívocamente la voluntad y se cumplen los demás requisitos. La
  responsabilidad de demostrar que se obtuvo consentimiento válido recae en
  el titular del banco o responsable (Reglamento, arts. 5 y 9).
- La ley no exige que los términos y condiciones de servicio sean la forma de
  obtener consentimiento de privacidad. Conviene modelar como aceptaciones
  diferentes: el acuerdo contractual de uso y, cuando el tratamiento lo
  requiera, el consentimiento para finalidades concretas. Esta separación es
  una recomendación de diseño derivada de los requisitos de libertad,
  información y finalidad, no una frase literal de la ley.

### Revocación, datos sensibles y menores

- La persona puede revocar consentimiento en cualquier momento, sin justificar
  y sin efecto retroactivo. El mecanismo debe ser fácilmente accesible,
  incondicional, sencillo, rápido y gratuito. La revocación de finalidades
  adicionales no debe afectar las finalidades que continúan autorizadas; los
  tratamientos en curso deben adecuarse con diligencia en un máximo de diez
  días (Reglamento, art. 10).
- Si se tratan datos sensibles, el consentimiento debe además otorgarse por
  escrito, salvo que una ley autorice el tratamiento por motivos importantes de
  interés público (Ley, art. 13.6).
- Para niños, niñas y adolescentes se requiere consentimiento de quien ejerce
  patria potestad o tutela. En general, mayores de 14 y menores de 18 pueden
  consentir si la información se expresa en lenguaje comprensible; para
  servicios digitales dirigidos a menores de 14 se requiere consentimiento
  parental/tutelar y esfuerzos razonables para verificar identidad (Reglamento,
  arts. 22 y 25). El interés superior del niño debe protegerse.

### Derechos y operaciones que pueden requerir historias

- La persona puede solicitar acceso, actualización, inclusión, rectificación,
  supresión/cancelación y oposición, además de impedir ciertos suministros
  (Ley, arts. 19–22). Los canales, plazos y respuestas deben revisarse contra
  el Reglamento aplicable al flujo real; una historia de aceptación no cubre
  por sí sola la atención de estos derechos.
- Toda transferencia a otro destinatario requiere consentimiento salvo las
  excepciones legales y debe limitarse a la finalidad justificante. Si se
  solicita consentimiento para un tratamiento que incluye o puede incluir
  transferencia nacional o internacional, debe informarse inequívocamente esa
  circunstancia, el propósito y la actividad del receptor. El flujo
  transfronterizo está sujeto a nivel adecuado o garantías previstas en la Ley
  y Reglamento (Reglamento, arts. 1.4 y 12–20; Ley, art. 15).
- La Ley exige medidas técnicas, organizativas y legales de seguridad y
  confidencialidad (Ley, arts. 16–17). El Reglamento establece notificación de
  incidentes de seguridad a la ANPD dentro de 48 horas en los supuestos
  previstos, y comunicación a titulares en 48 horas cuando el incidente afecte
  otros derechos (Reglamento, art. 34). La aplicabilidad concreta debe
  determinarse para el tratamiento de Ayni.
- La obligación de inscribir bancos de datos personales y otros deberes de
  responsables/titulares deben evaluarse según los bancos y roles reales de
  Ayni; no deben resolverse solamente agregando una casilla de aceptación
  (Ley, arts. 29–30; Reglamento).

## Lectura para el backlog

Las fuentes respaldan evaluar historias separadas para: (1) presentar y
versionar las condiciones de servicio y registrar su aceptación, si Ayni
necesita ese acuerdo; (2) publicar la información de privacidad previa y
registrar consentimientos específicos cuando sean la base aplicable; (3)
consultar/revocar consentimientos; y (4) ejercer derechos sobre datos. Las
historias adicionales sobre menores, datos sensibles, transferencias,
retención, seguridad y atención de incidentes dependen del inventario real de
datos, finalidades, roles y proveedores. Estos son temas candidatos, no una
afirmación de que todos aplican hoy a Ayni.

## Fuentes

- Congreso de la República, [Ley N.º 29733](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf), especialmente arts. 5–13, 15–18, 19–30.
- Diario Oficial El Peruano, [Reglamento actualizado — D.S. N.º 016-2024-JUS](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23), especialmente arts. 1–10, 12–25 y 34.
- Diario Oficial El Peruano, [publicación del D.S. N.º 016-2024-JUS](https://busquedas.elperuano.pe/dispositivo/SE/2349653-1), incluyendo la disposición derogatoria del reglamento anterior.
