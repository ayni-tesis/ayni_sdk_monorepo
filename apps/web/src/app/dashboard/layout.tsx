"use client";

import { hasAcceptedCurrentTerms } from "@ayni/env/terms";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import Dashboard from "./dashboard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const acceptedVersion = (session?.user as { termsAcceptedVersion?: string } | undefined)
    ?.termsAcceptedVersion;

  useEffect(() => {
    if (!isPending && (!session || !hasAcceptedCurrentTerms(acceptedVersion))) {
      router.replace("/login");
    }
  }, [acceptedVersion, isPending, router, session]);

  if (isPending || !session || !hasAcceptedCurrentTerms(acceptedVersion)) return <Loader />;

  return <Dashboard userName={session.user.name}>{children}</Dashboard>;
}
