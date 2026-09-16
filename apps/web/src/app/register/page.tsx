"use client";

import { useRouter } from "next/navigation";
import SignUpForm from "@/components/sign-up-form";

export default function RegisterPage() {
  const router = useRouter();
  return (
    <main className="grid min-h-svh place-items-start px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:place-items-center sm:p-6">
      <SignUpForm onSwitchToSignIn={() => router.push("/login")} />
    </main>
  );
}
