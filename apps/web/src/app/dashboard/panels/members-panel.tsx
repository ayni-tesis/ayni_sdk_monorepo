"use client";

import { IconDots, IconRefresh, IconTrash, IconUserPlus } from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/api-error";
import { httpClient } from "@/lib/http-client";
import { formatWorkspaceRole } from "@/lib/workspace-roles";
import type { MemberItem } from "../types";

function membersErrorMessage(error: unknown): string {
  const fallback = "No pudimos cargar los miembros. Inténtalo de nuevo.";
  if (!axios.isAxiosError<{ message?: string }>(error)) return fallback;
  if (error.response?.status === 403) {
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}

export type ChangeRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberItem | null;
  role: "admin" | "member";
  setRole: (role: "admin" | "member") => void;
  updatingRole: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

export function ChangeRoleDialog({
  open,
  onOpenChange,
  member,
  role,
  setRole,
  updatingRole,
  onSubmit,
}: ChangeRoleDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!updatingRole) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar rol</DialogTitle>
          <DialogDescription>
            Selecciona el nuevo rol para {member?.name ?? "el miembro"}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="member-role" className="font-semibold text-sm">
              Rol
            </label>
            <Select value={role} onValueChange={(val) => setRole(val as "admin" | "member")}>
              <SelectTrigger id="member-role" data-testid="role-selector-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin" data-testid="role-option-admin">
                  Administrador
                </SelectItem>
                <SelectItem value="member" data-testid="role-option-member">
                  Miembro
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={updatingRole}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={updatingRole}>
              {updatingRole ? "Actualizando rol…" : "Actualizar rol"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type MembersPanelProps = {
  workspaceId: string;
  workspaceName: string;
  canManage?: boolean;
};

export function MembersPanel({ workspaceId, workspaceName, canManage = false }: MembersPanelProps) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<MemberItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"admin" | "member">("member");
  const [updatingRole, setUpdatingRole] = useState(false);
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const [invitationRole, setInvitationRole] = useState<"admin" | "member">("member");
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState("");
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadMembers = useCallback(async (organizationId: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const { data } = await httpClient.get<MemberItem[]>(
        `/organizations/${organizationId}/members`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || workspaceIdRef.current !== organizationId) return;
      setMembers(data);
    } catch (loadError) {
      if (controller.signal.aborted || workspaceIdRef.current !== organizationId) return;
      setError(membersErrorMessage(loadError));
    } finally {
      if (!controller.signal.aborted && workspaceIdRef.current === organizationId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadMembers(workspaceId);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [workspaceId, loadMembers]);

  async function removeMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberToRemove) return;
    setRemoving(true);
    try {
      await httpClient.delete(`/organizations/${workspaceId}/members/${memberToRemove.id}`);
      setMembers((items) => items.filter((item) => item.id !== memberToRemove.id));
      setMemberToRemove(null);
      toast.success("Miembro retirado.");
    } catch (removeError) {
      toast.error(
        errorMessage(removeError, "No pudimos retirar al miembro. Inténtalo nuevamente."),
      );
    } finally {
      setRemoving(false);
    }
  }

  function openChangeRole(memberItem: MemberItem) {
    setSelectedMember(memberItem);
    setSelectedRole(memberItem.role === "admin" ? "admin" : "member");
    setRoleDialogOpen(true);
  }

  async function handleUpdateRole(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedMember) return;
    setUpdatingRole(true);
    try {
      const { data } = await httpClient.patch<MemberItem>(
        `/organizations/${workspaceId}/members/${selectedMember.id}`,
        { role: selectedRole },
      );
      setMembers((items) => items.map((m) => (m.id === data.id ? { ...m, role: data.role } : m)));
      toast.success("Rol actualizado.");
      setRoleDialogOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "No pudimos actualizar el rol."));
    } finally {
      setUpdatingRole(false);
    }
  }

  function openCreateInvitation() {
    setInvitationRole("member");
    setInvitationUrl("");
    inviteDialog.current?.showModal();
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingInvitation) return;
    setCreatingInvitation(true);
    try {
      const { data } = await httpClient.post<{ invitation: { token: string } }>(
        `/organizations/${workspaceId}/invitation-links`,
        { role: invitationRole },
      );
      setInvitationUrl(`${window.location.origin}/join?token=${data.invitation.token}`);
      toast.success("Enlace de invitación creado.");
    } catch (inviteError) {
      toast.error(errorMessage(inviteError, "No pudimos crear el enlace. Inténtalo de nuevo."));
    } finally {
      setCreatingInvitation(false);
    }
  }

  async function copyInvitationUrl() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No pudimos copiar el enlace. Inténtalo de nuevo.");
    }
  }

  return (
    <section className="members-section" aria-live="polite">
      <header className="applications-header">
        <div>
          <p>{workspaceName}</p>
          <h1>Miembros</h1>
        </div>
        {canManage && (
          <Button onClick={openCreateInvitation}>
            <IconUserPlus />
            Crear enlace de invitación
          </Button>
        )}
      </header>
      {loading ? (
        <p>Cargando miembros…</p>
      ) : error ? (
        <div className="applications-error">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void loadMembers(workspaceId)}>
            <IconRefresh />
            Reintentar
          </Button>
        </div>
      ) : members.length === 0 ? (
        <div className="applications-empty">
          <h2>Este workspace aún no tiene otros miembros.</h2>
        </div>
      ) : (
        <ul className="members-list">
          {members.map((memberItem) => (
            <li key={memberItem.id}>
              <div>
                <strong>{memberItem.name}</strong>
                <span>{memberItem.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="application-status">{formatWorkspaceRole(memberItem.role)}</span>
                {canManage && memberItem.role !== "owner" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`member-menu-${memberItem.id}`}
                          aria-label={`Acciones de ${memberItem.name}`}
                        >
                          <IconDots />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openChangeRole(memberItem)}>
                        Cambiar rol
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setMemberToRemove(memberItem)}
                      >
                        <IconTrash className="mr-2 size-4" />
                        <span>Retirar miembro</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!removing && !open) setMemberToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Retirar a este miembro del workspace?</DialogTitle>
            <DialogDescription>
              Perderá el acceso a las aplicaciones y recursos de este workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={removeMember} className="flex flex-col gap-4">
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={removing}
                onClick={() => setMemberToRemove(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={removing}
                data-testid="confirm-remove-member"
              >
                {removing ? "Retirando miembro…" : "Retirar miembro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ChangeRoleDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        member={selectedMember}
        role={selectedRole}
        setRole={setSelectedRole}
        updatingRole={updatingRole}
        onSubmit={handleUpdateRole}
      />
      <dialog
        ref={inviteDialog}
        className="application-dialog"
        aria-labelledby="invitation-dialog-title"
        onClose={() => setInvitationUrl("")}
      >
        <form onSubmit={createInvitation}>
          <h2 id="invitation-dialog-title">Crear enlace de invitación</h2>
          {invitationUrl ? (
            <>
              <p>Comparte este enlace con la persona que quieres invitar.</p>
              <p className="invitation-url" data-testid="invitation-url">
                {invitationUrl}
              </p>
              <div>
                <Button type="button" variant="ghost" onClick={() => inviteDialog.current?.close()}>
                  Cerrar
                </Button>
                <Button type="button" onClick={() => void copyInvitationUrl()}>
                  Copiar enlace
                </Button>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="invitation-role">Rol</label>
              <select
                id="invitation-role"
                value={invitationRole}
                onChange={(event) => {
                  setInvitationRole(event.target.value as "admin" | "member");
                }}
              >
                <option value="admin">Administrador</option>
                <option value="member">Miembro</option>
              </select>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={creatingInvitation}
                  onClick={() => inviteDialog.current?.close()}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  data-testid="create-invitation-submit"
                  disabled={creatingInvitation}
                >
                  {creatingInvitation ? "Creando enlace…" : "Crear enlace"}
                </Button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </section>
  );
}
