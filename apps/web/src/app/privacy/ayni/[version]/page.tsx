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
        responsable, el canal para ejercer derechos, los destinatarios, la conservación y la
        revisión legal.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Responsable y contacto</h2>
        <p>
          La persona jurídica responsable y el canal para consultas o ejercicio de derechos están
          pendientes de confirmación. Ayni no completa esos datos por inferencia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Datos y uso observado</h2>
        <p>El registro de una cuenta solicita nombre, correo electrónico y contraseña.</p>
        <p>
          Para crear y autenticar cuentas, mantener sesiones y conservar la versión de los términos
          aceptada se usan los datos asociados a esas operaciones. Los registros técnicos de sesión
          incluyen dirección IP y agente de usuario cuando están disponibles.
        </p>
        <p>
          La contraseña se almacena como credencial protegida por el proveedor de autenticación; no
          se muestra en la plataforma. La aplicación también registra la fecha de creación de la
          cuenta y la fecha y versión de aceptación de términos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-xl">Información pendiente de confirmar</h2>
        <p>
          Antes de publicar este aviso como vigente, Ayni debe confirmar las categorías completas,
          los campos obligatorios y opcionales, los proveedores y destinatarios, las transferencias,
          los plazos de conservación y el canal para ejercer derechos.
        </p>
      </section>

      <p className="border-t pt-4 text-muted-foreground text-sm">
        Este aviso es independiente de los{" "}
        <Link className="underline" href={"/terms/1.0.0" as Route}>
          Términos y condiciones
        </Link>{" "}
        y no registra consentimiento.
      </p>
      <Link className="text-primary underline underline-offset-4" href="/register">
        Volver al registro
      </Link>
    </main>
  );
}
