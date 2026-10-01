import type { Metadata } from "next";
import { AuthDiptych } from "@/app/auth/auth-diptych";

export const metadata: Metadata = {
  title: "Iniciar sesión | Ayni",
  description: "Accede al workspace de ingeniería de Machine Learning y runtime edge de Ayni.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthDiptych initialMode="sign-in" next={next} />;
}
