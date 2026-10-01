# Investigación — Aviso de privacidad de cuentas Ayni

Fecha de consulta: 2026-09-30.

Esta nota delimita el contenido informativo que debe prepararse para el aviso
de las cuentas de Ayni y los hechos internos todavía por confirmar. No redacta
el aviso final, no determina la base legal de cada operación y no sustituye la
revisión de asesoría legal peruana.

## Qué exige informar la normativa

La [Ley N.° 29733, art. 18](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf)
reconoce el derecho a recibir información previa, detallada, sencilla, expresa
e inequívoca antes de recopilar datos. Para una recopilación en línea, una
política de privacidad fácilmente accesible e identificable puede cumplir el
deber de información.

El [Reglamento vigente, D.S. N.° 016-2024-JUS, arts. 6–7](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23)
detalla que, al obtener los datos directamente, debe comunicarse en lenguaje
claro, como mínimo:

- identidad y domicilio o dirección del titular del banco de datos o
  responsable al que se pueda acudir para ejercer derechos o revocar el
  consentimiento; y, cuando corresponda, la identidad y dirección del
  representante;
- cada finalidad del tratamiento y la identidad de los destinatarios, si los
  hay;
- existencia e identificación del banco de datos, cuando corresponda;
- qué respuestas son obligatorias o facultativas y qué ocurre si se entregan
  los datos o se niegan;
- transferencias nacionales o internacionales, si las hay;
- existencia de decisiones automatizadas, incluida elaboración de perfiles, y
  sus consecuencias para la persona;
- plazo de conservación; y
- mecanismos para ejercer los derechos del Título III de la Ley.

La publicación del aviso satisface información y transparencia, pero **no es
por sí misma consentimiento**. Cuando el tratamiento requiera consentimiento,
éste debe obtenerse separadamente y con los requisitos aplicables; el
Reglamento permite expresarlo por una acción digital inequívoca (arts. 3–7).
Los derechos de acceso, actualización, inclusión, rectificación, supresión y
oposición están en la Ley, arts. 19–22. El flujo transfronterizo debe evaluarse
conforme a la Ley, art. 15, y el Reglamento, arts. 12–20.

La ANPD considera dato personal toda información que identifica o hace
identificable a una persona; incluye expresamente el nombre y el correo
electrónico ([guía de datos personales](https://www.gob.pe/institucion/anpd/informes-publicaciones/4231337-datos-personales)).
Por tanto, aunque Ayni no recoja imágenes ni trazas del SDK actualmente, los
datos de cuenta sí son datos personales.

Identificar categorías concretas de datos en el aviso ayuda a que la
información sea detallada y entendible. Sin embargo, la lista literal del art.
18 y del art. 6.1 no formula “categorías de datos” como un campo independiente;
no debe describirse esa etiqueta como una cita textual de requisito.

La inscripción del banco es una obligación separada del aviso: el [trámite
oficial de la ANPD](https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales)
indica que también las personas naturales titulares deben inscribirlo en el
Registro Nacional de Protección de Datos Personales. No se trata de un banco
financiero: la base organizada de cuentas es el banco de datos personales.
La inscripción y la comunicación del flujo transfronterizo se tramitan ante la
ANPD; la página del [flujo transfronterizo](https://www.gob.pe/9253-inscribir-flujo-transfronterizo-de-datos-personales)
indica que los formularios de inscripción ya incluyen su comunicación.

## Hechos de Ayni y decisiones de producto

El registro solicita nombre, correo y contraseña ([formulario de registro](../../apps/web/src/app/auth/auth-diptych.tsx));
Better Auth habilita correo y contraseña, pero no OAuth ([auth](../../packages/auth/src/index.ts)).
El esquema guarda el nombre, correo, hash de contraseña, sesiones con IP y
agente de usuario cuando estén disponibles, metadatos de sesión, y la fecha y
versión de aceptación de términos ([esquema](../../packages/db/src/schema/auth.ts)).
El aviso debe describir estas categorías. Google/GitHub no está activo; si se
incorpora después, revisar los campos realmente recibidos y actualizar el aviso.

El equipo indicó que Ayni es una tesis en Perú, a cargo de Daniel F. Mamani Silva y Diego R.
Cisneros Tafur, con los correos U202219315@upc.edu.pe y U20221A715@upc.edu.pe, respectivamente.
Los autores son los contactos del proyecto; la UPC no se identifica como responsable por el solo
uso de correos institucionales.

1. **Entidad y rol:** reflejar a los autores y sus correos como responsables/
   contactos del proyecto, sin atribuir ese rol a UPC.
2. **Banco de datos:** la base de perfiles de usuario es un banco de datos
   personales; el equipo propone llamarlo “Cuentas Ayni” y confirmó que aún no
   está inscrito. El artículo 42.1 del Reglamento obliga a personas naturales
   o jurídicas que creen, modifiquen o cancelen bancos a tramitar su inscripción.
   La excepción doméstica de la Ley no describe una plataforma para desarrolladores.
   ANPD ofrece el trámite también a personas naturales; se debe tramitar la
   inscripción y comunicar el flujo transfronterizo que corresponda.
3. **Inventario de datos y fuentes:** campos de registro y perfil, identificadores
   de cuenta, autenticación/sesión, eventos de seguridad y soporte,
   comunicaciones y cualquier dato de navegación que realmente se recoja;
   indicar de qué fuente se obtiene y cuáles son obligatorios u opcionales.
4. **Finalidades y base por finalidad:** para qué se usa cada dato —por
   ejemplo, crear/autenticar cuentas, administrar espacios de trabajo,
   prestar y proteger el servicio, brindar soporte o acreditar aceptación de
   términos— solo si cada uso se verifica en el producto y operación. Asesoría
   legal debe confirmar la base aplicable; no presentar una finalidad futura o
   un consentimiento como si ya estuviera implementado.
5. **Destinatarios, encargados y transferencias:** el equipo confirma que
   Vercel y Neon procesan los datos de cuenta en São Paulo, Brasil. Cloudflare
   R2 guarda artefactos de modelos, no datos del perfil de cuenta; la ubicación
   de un CDN indica dónde puede servirse contenido en caché y no dónde se
   almacena el objeto. La documentación de R2 confirma que la caché requiere
   dominio personalizado y configuración, y que la ubicación de almacenamiento
   se maneja por separado ([ubicación](https://developers.cloudflare.com/r2/reference/data-location/),
   [caché R2](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)).
   Para el aviso de cuentas basta describir la transferencia de sus datos a
   Brasil mediante Vercel/Neon. Las imágenes y trazas del SDK pertenecen a una
   épica futura y no deben presentarse como recolección actual.
6. **Retención y eliminación:** la decisión de producto es conservar los datos
   mientras la cuenta exista, sin eliminación automática por inactividad. La
   persona puede pedir cierre y supresión por correo; el equipo deshabilita la
   cuenta y elimina manualmente lo que ya no sea necesario. Los recursos
   compartidos pueden continuar mientras sean necesarios para los demás
   miembros. No se promete conservar datos personales para siempre una vez que
   ya no sean necesarios: la Ley exige conservarlos solo por el tiempo
   necesario (art. 8).
7. **Derechos y contacto:** incluir los nombres completos que proporcionó el
   equipo y sus correos. Las solicitudes pueden dirigirse a esos correos;
   definir la verificación proporcional de identidad y confirmar que ambos
   canales serán monitoreados.
8. **Automatización y población destinataria:** se decidió reservar las
   cuentas de desarrollador a personas de 18 años o más. La edad se declara al
   aceptar los términos; no se recopila fecha de nacimiento ni se habilita un
   flujo de consentimiento de menores. La restricción aplica a las cuentas de
   Ayni, no a los usuarios finales de aplicaciones que integren el SDK. Revisar
   además si existe alguna decisión automatizada que afecte significativamente
   a las cuentas.
9. **Obligación independiente:** inscribir Cuentas Ayni y comunicar el flujo
   transfronterizo a Brasil ante la ANPD. La inscripción no es un trámite
   financiero ni forma parte de la publicación del aviso; debe completarse por
   separado por quien figure como titular del banco.

### Estado técnico observado

El repositorio mantiene `AYNI_PRIVACY_NOTICE` en versión `1.0.1` con estado
`published` ([configuración](../../packages/env/src/privacy-notice.ts)). El
registro se habilita y el inicio de sesión requiere aceptar la versión actual
de los términos; la versión 1.0.1 incluye una declaración de mayoría de edad
([registro](../../apps/web/src/app/auth/auth-diptych.tsx),
[autenticación](../../packages/auth/src/index.ts)). La inscripción del banco
Cuentas Ayni y la comunicación del flujo transfronterizo siguen pendientes
como obligación administrativa independiente. Cloudflare R2 no contiene datos
de perfil según el equipo; su ubicación no se incluye como región de
almacenamiento de datos de cuenta. El aviso registra que Neon y Vercel están en
São Paulo según la configuración informada por el equipo.
([página del aviso](../../apps/web/src/app/privacy/ayni/[version]/page.tsx)).

## Fuentes oficiales

- Congreso de la República, [Ley N.° 29733](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf),
  arts. 6–8, 15, 18–22.
- Diario Oficial El Peruano, [Reglamento de la Ley N.° 29733, D.S.
  N.° 016-2024-JUS, texto actualizado](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23),
  arts. 3–9, 12–25 y 42–45. Reglamento publicado por la ANPD en la
  [plataforma oficial del Estado](https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus).
- Autoridad Nacional de Protección de Datos Personales,
  [inscribir un banco de datos personales](https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales).
- Autoridad Nacional de Protección de Datos Personales,
  [inscribir el flujo transfronterizo de datos personales](https://www.gob.pe/9253-inscribir-flujo-transfronterizo-de-datos-personales).
- Vercel, [regiones de infraestructura y valores predeterminados](https://vercel.com/docs/functions/configuring-functions/region).
- Cloudflare, [ubicación de datos de R2 y límites de las sugerencias de ubicación](https://developers.cloudflare.com/r2/reference/data-location/).
