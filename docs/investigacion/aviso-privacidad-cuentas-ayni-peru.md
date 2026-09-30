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

Identificar categorías concretas de datos en el aviso ayuda a que la
información sea detallada y entendible. Sin embargo, la lista literal del art.
18 y del art. 6.1 no formula “categorías de datos” como un campo independiente;
no debe describirse esa etiqueta como una cita textual de requisito.

La inscripción del banco es una obligación separada del aviso: el [trámite
oficial de la ANPD](https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales)
indica que quien sea titular de un banco de datos personales debe inscribirlo
en el Registro Nacional de Protección de Datos Personales. El Reglamento, art.
42, regula la inscripción. La aplicabilidad, nombre y código del banco de
cuentas de Ayni deben verificarse; no se deben inventar ni usar el aviso para
afirmar que la inscripción ya ocurrió.

## Hechos de Ayni que faltan confirmar antes de publicar

La interfaz vigente solicita nombre, correo electrónico y contraseña al crear
una cuenta ([formulario de registro](../../apps/web/src/app/auth/auth-diptych.tsx));
la configuración del servidor habilita registro por correo y contraseña
([auth](../../packages/auth/src/index.ts)). Esto solo acredita los campos
observables en ese flujo, no el inventario completo de datos tratados por Ayni.

El equipo de tesis proporcionó como canales de contacto U202219315@upc.edu.pe y
U20221A715@upc.edu.pe. Esto permite mostrar un canal de contacto, pero no identifica por sí
solo a la persona responsable del tratamiento ni significa que la UPC asuma esa responsabilidad.
La persona responsable de Ayni y su asesoría legal deben confirmar y aportar:

1. **Entidad y rol:** razón social o nombre legal exacto que opera Ayni,
   domicilio o dirección de contacto, jurisdicción, RUC si corresponde, y si
   actúa como titular del banco, responsable del tratamiento o en algún otro
   rol para cada actividad. El producto “Ayni” no identifica por sí solo a la
   persona jurídica. Si aplica, identificar al representante en Perú.
2. **Banco de datos:** nombre exacto del banco que contendrá las cuentas,
   existencia/código de inscripción y responsable titular. Confirmar si el
   deber de inscripción aplica y completar el trámite por separado si aún no
   se hizo.
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
5. **Destinatarios, encargados y transferencias:** nombres y función de los
   proveedores que realmente reciben o almacenan datos (incluidos
   autenticación, base de datos, alojamiento, correo, monitoreo/errores y
   soporte, según aplique), países desde los que acceden o donde almacenan, y
   mecanismo legal para cualquier flujo internacional. No asumir proveedor o
   país a partir de dependencias del código.
6. **Retención y eliminación:** plazo o criterio por categoría; qué pasa al
   cerrar una cuenta; copias de seguridad, registros de seguridad y evidencia
   de aceptación; excepciones de conservación que tengan sustento. Evitar un
   “por el tiempo necesario” sin explicar el criterio real.
7. **Derechos y contacto:** confirmar que el equipo monitorea los dos correos
   institucionales indicados, quién atenderá las solicitudes y cómo verificar
   identidad de forma proporcional. La persona responsable y la entidad a la
   que se dirigen las solicitudes aún deben identificarse.
8. **Automatización y población destinataria:** confirmar si hay decisiones
   automatizadas o perfiles que afecten a titulares y sus consecuencias; y si
   el servicio se dirige a menores o permite su registro, para definir los
   requisitos aplicables.
9. **Publicación:** versión, fecha de vigencia, ubicación pública estable y
   revisión legal del texto final frente a los flujos reales.

### Estado técnico observado

El repositorio mantiene `AYNI_PRIVACY_NOTICE` en versión `1.0.0` con estado
`draft` ([configuración](../../packages/env/src/privacy-notice.ts)). El flujo de
registro y el hook del servidor bloquean altas mientras el aviso no se marque
publicado ([registro](../../apps/web/src/app/auth/auth-diptych.tsx),
[servidor de autenticación](../../packages/auth/src/index.ts)). La página
visible actualmente indica que siguen pendientes entidad responsable,
proveedores/destinatarios, transferencias, conservación y revisión legal
([página del aviso](../../apps/web/src/app/privacy/ayni/[version]/page.tsx)).
Por tanto, se puede preparar y revisar el contenido, pero no cambiar el estado
a `published` hasta que se confirmen esos hechos y se revise el tratamiento
completo.

## Fuentes oficiales

- Congreso de la República, [Ley N.° 29733](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf),
  arts. 15, 18–22.
- Diario Oficial El Peruano, [Reglamento de la Ley N.° 29733, D.S.
  N.° 016-2024-JUS, texto actualizado](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23),
  arts. 3–9, 12–20 y 42. Reglamento publicado por la ANPD en la
  [plataforma oficial del Estado](https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus).
- Autoridad Nacional de Protección de Datos Personales,
  [inscribir un banco de datos personales](https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales).
