"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatWorkspaceRole } from "@/app/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";

type InvitationPreview = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  expiresAt: string;
};

type JoinStatus = "loading" | "ready" | "joining" | "invalid" | "already-member";

export default function JoinInvitation({ token, userName }: { token: string; userName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
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
  }, [token]);

  async function joinWorkspace() {
    if (!invitation) return;
    setStatus("joining");
    try {
      const { data } = await httpClient.post<{
        organization: { id: string; name: string; role: string };
      }>(`/invitation-links/${token}/accept`);
      await authClient.organization.setActive({ organizationId: data.organization.id });
      toast.success(`Te uniste a ${data.organization.name}.`);
      router.push("/dashboard");
    } catch (joinError) {
      if (axios.isAxiosError(joinError) && joinError.response?.status === 409) {
        setMessage(errorMessage(joinError, "Ya eres miembro de este workspace."));
        setStatus("already-member");
        return;
      }
      setMessage(errorMessage(joinError, "No pudimos unirte al workspace. Inténtalo de nuevo."));
      setStatus("invalid");
    }
  }

  if (status === "loading") {
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
            {userName}, te invitaron a unirte a <strong>{invitation.organizationName}</strong> como{" "}
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
        {status === "already-member" && (
          <Button onClick={() => router.push("/dashboard")}>Ir al dashboard</Button>
        )}
      </div>
    </main>
  );
}
