export default async function TermsPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (version !== "1.0.0") {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="font-semibold text-2xl">Versión no disponible</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="font-semibold text-3xl">Términos y condiciones de Ayni</h1>
      <p>Versión {version} · Vigente desde el 30 de septiembre de 2026</p>
      <p>
        Al crear una cuenta, aceptas estas condiciones para acceder a la plataforma Ayni y
        administrar espacios de trabajo y aplicaciones.
      </p>
      <h2 className="font-semibold text-xl">Uso de la plataforma</h2>
      <p>
        Debes proporcionar información de cuenta correcta, proteger tus credenciales y usar Ayni de
        acuerdo con la ley y con los permisos asignados a tu espacio de trabajo. Eres responsable de
        las aplicaciones, modelos, workflows y datos que configures.
      </p>
      <h2 className="font-semibold text-xl">Aplicaciones y SDK</h2>
      <p>
        Las credenciales del SDK son secretas y deben limitarse a la aplicación correspondiente. El
        titular de cada aplicación determina sus finalidades, avisos y bases aplicables para los
        datos que recopila mediante esa aplicación.
      </p>
      <h2 className="font-semibold text-xl">Disponibilidad y cambios</h2>
      <p>
        Podemos actualizar estas condiciones. Si un cambio requiere nueva aceptación, solicitaremos
        una acción afirmativa antes de continuar con las funciones sujetas al acuerdo. Conservaremos
        las versiones anteriores y la evidencia de aceptación.
      </p>
      <h2 className="font-semibold text-xl">Contacto</h2>
      <p>
        Para consultas sobre estas condiciones, contacta al equipo de Ayni por el canal de soporte
        de tu organización.
      </p>
      <p className="border-t pt-4 text-muted-foreground text-sm">
        Borrador sujeto a validación legal antes de su puesta en producción.
      </p>
    </main>
  );
}
