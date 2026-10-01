import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
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
      <p>Versión {version} · Fecha de vigencia pendiente de revisión legal</p>
      <p role="status" className="rounded-md border border-amber-500 p-4 text-sm">
        Borrador de producto. No usar como aviso legal vigente hasta completar la identidad del
        responsable, los destinatarios, la conservación y la revisión legal.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Responsable y contacto</h2>
        <p>
          Ayni es un proyecto de tesis en Perú. Las personas responsables del proyecto son Daniel
          Mamani S. y Diego R. Cisneros T. Para consultas sobre privacidad o para presentar
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
        <p>El registro de una cuenta solicita nombre, correo electrónico y contraseña.</p>
        <p>
          Ayni ofrece cuentas a desarrolladores para autenticarse y administrar espacios de trabajo,
          aplicaciones y recursos del SDK. Para crear la cuenta y prestar esas funciones se usan los
          datos de registro, las sesiones y la versión de los términos aceptada. Los registros
          técnicos de sesión incluyen dirección IP y agente de usuario cuando están disponibles.
        </p>
        <p>
          La contraseña se almacena como credencial protegida por el proveedor de autenticación; no
          se muestra en la plataforma. La aplicación también registra la fecha de creación de la
          cuenta y la fecha y versión de aceptación de términos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Proveedores</h2>
        <p>
          El proyecto utiliza Vercel para alojar la aplicación, Neon para la base de datos y
          Cloudflare R2 para almacenar artefactos de modelos. Ayni puede ser utilizado por
          desarrolladores desde distintos países; las regiones concretas de almacenamiento y acceso
          de cada servicio están pendientes de confirmación.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Conservación</h2>
        <p>
          El criterio definido por el proyecto es conservar la cuenta hasta que la persona solicite
          su eliminación o transcurra un año desde su último inicio de sesión, lo que ocurra
          primero. El equipo realizará ambas eliminaciones manualmente mediante la base de datos;
          no se ejecutarán automáticamente. Antes de presentar este criterio como vigente, falta
          definir cómo se eliminarán las sesiones, las evidencias de aceptación y las copias de
          seguridad.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Información pendiente de confirmar</h2>
        <p>
          Antes de publicar este aviso como vigente, el equipo debe confirmar las regiones de
          almacenamiento y acceso de los proveedores, definir el alcance del borrado manual de
          cuentas, revisar si corresponde inscribir el banco de datos personales,
          confirmar si hay decisiones automatizadas que afecten a las cuentas y completar la
          revisión legal.
        </p>
      </section>

      <p className="border-t pt-4 text-muted-foreground text-sm">
        Este aviso es independiente de los{" "}
        <Link className="underline" href={"/terms/1.0.0" as Route}>
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
