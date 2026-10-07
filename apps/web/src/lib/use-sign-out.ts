"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

export function useSignOut() {
  const router = useRouter();
  const pending = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const signOut = useCallback(async () => {
    if (pending.current) return;

    pending.current = true;
    setIsPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      router.push("/");
    } catch {
      toast.error("No pudimos cerrar sesión. Inténtalo nuevamente.");
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  }, [router]);

  return { isPending, signOut };
}
