import type { Metadata } from "next";
import { AuthDiptych } from "@/app/auth/auth-diptych";

export const metadata: Metadata = {
  title: "Crear cuenta | Ayni",
  description: "Crea tu cuenta de desarrollador en Ayni para desplegar workflows en dispositivos.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthDiptych initialMode="sign-up" next={next} />;
}
