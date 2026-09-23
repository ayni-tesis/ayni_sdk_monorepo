"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import Dashboard from "./dashboard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, router, session]);

  if (isPending || !session) return <Loader />;

  return <Dashboard userName={session.user.name}>{children}</Dashboard>;
}
