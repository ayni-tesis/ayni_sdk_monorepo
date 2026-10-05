"use client";

import { hasAcceptedCurrentTerms } from "@ayni/env/terms";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import { joinSignInRedirect } from "@/lib/post-auth";
import { formatWorkspaceRole } from "@/lib/workspace-roles";

type InvitationPreview = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  expiresAt: string;
};

type JoinStatus = "loading" | "ready" | "joining" | "invalid" | "joined";

export default function JoinInvitation({ token }: { token: string }) {
  const router = useRouter();
  // The session cookie belongs to the API server's domain, so only the browser can read it.
  const { data: session, isPending } = authClient.useSession();
  const acceptedVersion = (session?.user as { termsAcceptedVersion?: string } | undefined)
    ?.termsAcceptedVersion;
  const signedIn = !!session && hasAcceptedCurrentTerms(acceptedVersion);
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isPending || signedIn) return;
    let active = true;
    void (async () => {
      // better-auth refreshes the shared session store ~10 ms after sign-in's onSuccess has
      // already navigated here, so ask the server before treating the visitor as signed out.
      let fresh: unknown;
      try {
        fresh = (await authClient.getSession()).data;
      } catch {
        fresh = null;
      }
      const freshVersion = (fresh as { user?: { termsAcceptedVersion?: string } } | null)?.user
        ?.termsAcceptedVersion;
      if (active && !hasAcceptedCurrentTerms(freshVersion)) {
        router.replace(joinSignInRedirect(token || undefined));
      }
    })();
    return () => {
      active = false;
    };
  }, [isPending, router, signedIn, token]);

  useEffect(() => {
    if (!signedIn) return;
    if (!token) {
      setStatus("invalid");
      setMessage("Este enlace de invitación no es válido.");
      return;
    }
    let active = true;
    setStatus("loading");
    void (async () => {
      try {
        const { data } = await httpClient.get<{ invitation: InvitationPreview }>(
          `/invitation-links/${token}`,
        );
        if (!active) return;
        setInvitation(data.invitation);
        setStatus("ready");
      } catch (previewError) {
        if (!active) return;
        setMessage(errorMessage(previewError, "Este enlace de invitación no es válido."));
        setStatus("invalid");
      }
    })();
    return () => {
      active = false;
    };
  }, [signedIn, token]);

  async function activateWorkspace(organizationId: string) {
    try {
      const result = await authClient.organization.setActive({ organizationId });
      return !!result?.error;
    } catch {
      return true;
    }
  }

  async function joinWorkspace() {
    if (!invitation) return;
    setStatus("joining");
    try {
      const { data } = await httpClient.post<{
        organization: { id: string; name: string; role: string };
      }>(`/invitation-links/${token}/accept`);
      if (await activateWorkspace(data.organization.id)) {
        setMessage(
          `Te uniste a ${data.organization.name}, pero no pudimos cambiar al workspace automáticamente.`,
        );
        setStatus("joined");
        return;
      }
      toast.success(`Te uniste a ${data.organization.name}.`);
      router.push("/dashboard");
    } catch (joinError) {
      if (axios.isAxiosError(joinError) && joinError.response?.status === 409) {
        const base = errorMessage(joinError, "Ya eres miembro de este workspace.").replace(
          /[.\s]+$/,
          "",
        );
        if (await activateWorkspace(invitation.organizationId)) {
          setMessage(`${base}, pero no pudimos cambiar al workspace automáticamente.`);
        } else {
          setMessage(`${base}.`);
        }
        setStatus("joined");
        return;
      }
      setMessage(errorMessage(joinError, "No pudimos unirte al workspace. Inténtalo de nuevo."));
      setStatus("invalid");
    }
  }

  if (!signedIn || status === "loading") {
    return (
      <main className="grid min-h-svh place-items-center px-4">
        <p aria-live="polite">Cargando invitación…</p>
      </main>
    );
  }

  if ((status === "ready" || status === "joining") && invitation) {
    return (
      <main className="grid min-h-svh place-items-center px-4">
        <div className="flex w-full max-w-md flex-col gap-4">
          <h1 className="font-semibold text-2xl">Invitación al workspace</h1>
          <p>
            {session?.user.name}, te invitaron a unirte a{" "}
            <strong>{invitation.organizationName}</strong> como{" "}
            <strong>{formatWorkspaceRole(invitation.role)}</strong>.
          </p>
          <Button onClick={() => void joinWorkspace()} disabled={status === "joining"}>
            {status === "joining" ? "Uniéndose…" : "Unirse al workspace"}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="flex w-full max-w-md flex-col items-start gap-4">
        <h1 className="font-semibold text-2xl">Invitación al workspace</h1>
        <p aria-live="polite" role="alert">
          {message}
        </p>
        {status === "joined" && (
          <Button onClick={() => router.push("/dashboard")}>Ir al dashboard</Button>
        )}
      </div>
    </main>
  );
}
