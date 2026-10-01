import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { CURRENT_TERMS_VERSION } from "@ayni/env/terms";
import type { Route } from "next";
import Link from "next/link";

export default async function AyniPrivacyNoticePage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  if (version !== AYNI_PRIVACY_NOTICE.version) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="font-semibold text-2xl">Versión no disponible</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="font-semibold text-3xl">Aviso de privacidad de cuentas Ayni</h1>
      <p>Versión {version} · Vigente desde el 30 de septiembre de 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Responsable y contacto</h2>
        <p>
          Ayni es un proyecto de tesis en Perú. Las personas responsables del proyecto son Daniel F.
          Mamani Silva y Diego R. Cisneros Tafur. Para consultas sobre privacidad o para presentar
          solicitudes relacionadas con tus datos, puedes escribirles a{" "}
          <a className="underline" href="mailto:U202219315@upc.edu.pe">
            U202219315@upc.edu.pe
          </a>{" "}
          o{" "}
          <a className="underline" href="mailto:U20221A715@upc.edu.pe">
            U20221A715@upc.edu.pe
          </a>
          , respectivamente. Estos correos son canales de contacto del equipo de tesis; la UPC no se
          identifica aquí como responsable del tratamiento.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Datos y uso observado</h2>
        <p>
          El registro solicita nombre, correo electrónico y contraseña. El nombre, el correo y los
          identificadores técnicos vinculados a una cuenta son datos personales aunque Ayni no
          recoja imágenes de usuarios.
        </p>
        <p>
          Ayni ofrece cuentas a desarrolladores para autenticarse y administrar espacios de trabajo,
          aplicaciones y recursos del SDK. Para crear la cuenta y prestar esas funciones se usan los
          datos de registro, las sesiones y la versión de los términos aceptada. Los registros
          técnicos de sesión incluyen dirección IP y agente de usuario cuando están disponibles.
        </p>
        <p>
          La contraseña se guarda como un hash, no como texto legible. La aplicación conserva la
          fecha de creación de la cuenta y la fecha y versión de aceptación de los términos. El
          inicio de sesión con Google o GitHub no está habilitado actualmente; si se incorpora, se
          informará qué identificadores devuelve el proveedor y se actualizará este aviso antes de
          habilitarlo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Proveedores</h2>
        <p>
          Según la configuración informada por el equipo, Vercel aloja la aplicación y Neon procesa
          los datos de las cuentas y los comprobantes seudónimos de consentimiento del SDK en São
          Paulo, Brasil. Cloudflare R2 guarda artefactos de modelos, no los datos del perfil de
          cuenta. La ubicación de un CDN describe dónde puede servirse una copia en caché y no la
          ubicación del bucket. Ayni está dirigido a desarrolladores y puede usarse desde distintos
          países.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Uso del SDK</h2>
        <p>
          Cuando una aplicación registra una decisión de privacidad de una persona usuaria, Ayni
          recibe y conserva un comprobante seudónimo: identificador aleatorio, finalidad, decisión,
          versión del aviso y fecha. No incluye nombre ni correo. El desarrollador que integra el
          SDK debe informar a sus usuarios y obtener los consentimientos que correspondan para su
          aplicación.
        </p>
        <p>
          Ayni no recolecta actualmente imágenes ni trazas de uso del SDK. La captura y
          sincronización de ese material pertenecen a una funcionalidad futura; este aviso y los
          controles de consentimiento deberán actualizarse antes de habilitarla.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Edad</h2>
        <p>
          La creación de cuentas de desarrollador está reservada a personas de 18 años o más. No
          solicitamos fecha de nacimiento; al aceptar los términos, la persona declara cumplir este
          requisito. Esta regla se refiere a la cuenta de Ayni, no fija la edad de los usuarios de
          las aplicaciones que integran el SDK.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Conservación</h2>
        <p>
          Conservamos los datos de la cuenta mientras esta permanezca abierta, sin una fecha de
          eliminación automática por inactividad. Puedes solicitar el cierre y la eliminación
          escribiendo a los correos indicados arriba; el equipo deshabilitará la cuenta y tramitará
          manualmente la supresión de los datos que ya no sean necesarios. Los datos de workspaces
          compartidos podrán mantenerse mientras sean necesarios para que otros miembros continúen
          usando esos recursos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Tus derechos</h2>
        <p>
          Puedes solicitar acceso, rectificación, cancelación o supresión y oposición escribiendo a
          cualquiera de los correos de contacto. El aviso informa sobre el tratamiento; aceptar los
          Términos y condiciones es una acción separada.
        </p>
      </section>

      <p className="border-t pt-4 text-muted-foreground text-sm">
        Este aviso es independiente de los{" "}
        <Link className="underline" href={`/terms/${CURRENT_TERMS_VERSION}` as Route}>
          Términos y condiciones
        </Link>{" "}
        y no registra consentimiento.
      </p>
      <Link className="text-primary underline underline-offset-4" href="/sign-up">
        Volver al registro
      </Link>
    </main>
  );
}
