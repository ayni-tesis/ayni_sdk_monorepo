"use client";

import {
  IconArchive,
  IconArrowLeft,
  IconChevronDown,
  IconCirclePlus,
  IconDots,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppSidebar, type DashboardView } from "@/components/app-sidebar";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { errorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import { generateWorkspaceSlug } from "@/lib/slug";
import { formatWorkspaceRole } from "@/lib/workspace-roles";
import "./dashboard.css";

type Application = {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "archived";
};

type GeneratedCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

function membersErrorMessage(error: unknown) {
  const fallback = "No pudimos cargar los miembros. Inténtalo de nuevo.";
  if (!axios.isAxiosError<{ message?: string }>(error)) return fallback;
  if (error.response?.status === 403) {
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type MemberItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function ChangeRoleDialog({
  open,
  onOpenChange,
  member,
  role,
  setRole,
  updatingRole,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberItem | null;
  role: "admin" | "member";
  setRole: (role: "admin" | "member") => void;
  updatingRole: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
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

function MembersPanel({
  workspaceId,
  workspaceName,
  canManage = false,
}: {
  workspaceId: string;
  workspaceName: string;
  canManage?: boolean;
}) {
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

function DashboardShell({
  children,
  userName,
  workspaceName,
  workspaces = [],
  loadingWorkspaces = false,
  workspacesError = "",
  switchingWorkspace = false,
  activeView = "applications",
  membersDisabled = false,
  onSelectWorkspace,
  onViewChange,
  onRetryWorkspaces,
  onCreateWorkspace,
}: {
  children: React.ReactNode;
  userName: string;
  workspaceName?: string;
  workspaces?: WorkspaceItem[];
  loadingWorkspaces?: boolean;
  workspacesError?: string;
  switchingWorkspace?: boolean;
  activeView?: DashboardView;
  membersDisabled?: boolean;
  onSelectWorkspace?: (id: string) => void;
  onViewChange?: (view: DashboardView) => void;
  onRetryWorkspaces?: () => void;
  onCreateWorkspace?: () => void;
}) {
  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspaceName}
        activeView={activeView}
        membersDisabled={membersDisabled}
        onViewChange={onViewChange}
      />
      <SidebarInset>
        <header className="flex min-h-15 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <span className="text-muted-foreground text-sm">Workspace actual</span>
            {onCreateWorkspace ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  data-testid="workspace-selector-trigger"
                  disabled={switchingWorkspace}
                  render={
                    <Button
                      variant="ghost"
                      data-testid="workspace-selector-trigger"
                      disabled={switchingWorkspace}
                      className="flex items-center gap-1 px-2 font-semibold"
                    />
                  }
                >
                  <span className="truncate">
                    {switchingWorkspace
                      ? "Cambiando workspace…"
                      : loadingWorkspaces
                        ? "Cargando workspace…"
                        : workspacesError
                          ? "Error al cargar workspaces"
                          : workspaces.length === 0
                            ? "Aún no perteneces a ningún workspace."
                            : (workspaceName ?? "Cargando workspace…")}
                  </span>
                  <IconChevronDown className="size-4 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {workspacesError && onRetryWorkspaces && (
                    <DropdownMenuItem onClick={onRetryWorkspaces}>
                      <IconRefresh className="mr-2 size-4" />
                      <span>Reintentar</span>
                    </DropdownMenuItem>
                  )}
                  {workspaces.map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={() => onSelectWorkspace?.(ws.id)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="font-medium">{ws.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatWorkspaceRole(ws.role)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={onCreateWorkspace}>
                    <IconCirclePlus className="mr-2 size-4" />
                    <span>Crear workspace</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <strong className="truncate">{workspaceName ?? "Cargando workspace…"}</strong>
            )}
          </div>
          <span className="truncate text-muted-foreground text-sm">{userName}</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  workspaceName,
  setWorkspaceName,
  workspaceError,
  setWorkspaceError,
  creatingWorkspace,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  setWorkspaceName: (value: string) => void;
  workspaceError: string;
  setWorkspaceError: (value: string) => void;
  creatingWorkspace: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setWorkspaceName("");
          setWorkspaceError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Ingresa el nombre del nuevo workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="workspace-name" className="font-semibold text-sm">
              Nombre del workspace
            </label>
            <Input
              id="workspace-name"
              autoFocus
              value={workspaceName}
              onChange={(event) => {
                setWorkspaceName(event.target.value);
                if (workspaceError) setWorkspaceError("");
              }}
            />
            {workspaceError && (
              <p className="text-destructive text-sm" role="alert">
                {workspaceError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={creatingWorkspace}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              data-testid="create-workspace-submit"
              disabled={creatingWorkspace}
            >
              {creatingWorkspace ? "Creando workspace…" : "Crear workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateCredentialDialog({
  open,
  onOpenChange,
  onDiscard,
  generated,
  generating,
  onGenerate,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  generated: GeneratedCredential | null;
  generating: boolean;
  onGenerate: (event: React.FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (generating) return;
        if (!nextOpen && generated) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!generated && !generating}>
        <DialogHeader>
          <DialogTitle>Generar credencial SDK</DialogTitle>
          <DialogDescription>
            {generated
              ? "Copia tu credencial ahora. No podrás verla nuevamente."
              : "El secreto se mostrará una sola vez. Guárdalo en un lugar seguro."}
          </DialogDescription>
        </DialogHeader>
        {generated ? (
          <div className="flex flex-col gap-4">
            <code className="credential-secret" data-testid="credential-secret">
              {generated.secret}
            </code>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                data-testid="close-credential"
                onClick={onDiscard}
              >
                Cerrar
              </Button>
              <Button type="button" data-testid="copy-credential" onClick={onCopy}>
                Copiar credencial
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onGenerate} className="flex flex-col gap-4">
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={generating}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="generate-credential-submit" disabled={generating}>
                {generating ? "Generando credencial…" : "Generar credencial"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterModelDialog({
  open,
  onOpenChange,
  modelName,
  setModelName,
  modelError,
  setModelError,
  registering,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  setModelName: (value: string) => void;
  modelError: string;
  setModelError: (value: string) => void;
  registering: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setModelName("");
          setModelError("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar modelo</DialogTitle>
          <DialogDescription className="sr-only">
            Registra un nuevo modelo TensorFlow Lite para esta aplicación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="model-name" className="font-semibold text-sm">
              Nombre del modelo
            </label>
            <Input
              id="model-name"
              autoFocus
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value);
                if (modelError) setModelError("");
              }}
            />
            {modelError && (
              <p className="text-destructive text-sm" role="alert">
                {modelError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="model-runtime" className="font-semibold text-sm">
              Runtime
            </label>
            <Input
              id="model-runtime"
              value="TensorFlow Lite"
              disabled
              readOnly
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={registering}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              data-testid="register-model-submit"
              disabled={registering}
            >
              {registering ? "Registrando modelo…" : "Registrar modelo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Dashboard({ userName }: { userName: string }) {
  const organization = authClient.useActiveOrganization();
  const memberRole = authClient.useActiveMemberRole();
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [generatingCredential, setGeneratingCredential] = useState(false);
  const [generatedCredential, setGeneratedCredential] = useState<GeneratedCredential | null>(null);
  const [registerModelDialogOpen, setRegisterModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const [registeringModel, setRegisteringModel] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspacesError, setWorkspacesError] = useState("");
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [view, setView] = useState<DashboardView>("applications");
  const [selected, setSelected] = useState<Application | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const workspace = organization.data;
  const canManage = memberRole.data?.role === "admin" || memberRole.data?.role === "owner";
  const activeWorkspaceId = workspace?.id;
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const workspaceMissing =
    !!workspace &&
    !loadingWorkspaces &&
    !workspacesError &&
    !workspaces.some((ws) => ws.id === workspace.id);
  const abortControllerRef = useRef<AbortController | null>(null);
  const workspacesAbortRef = useRef<AbortController | null>(null);
  const workspaceSwitchGenerationRef = useRef(0);

  const loadWorkspaces = useCallback(async () => {
    workspacesAbortRef.current?.abort();
    const controller = new AbortController();
    workspacesAbortRef.current = controller;

    setLoadingWorkspaces(true);
    setWorkspacesError("");
    try {
      const { data } = await httpClient.get<WorkspaceItem[]>("/workspaces", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setWorkspaces(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      setWorkspacesError(
        errorMessage(err, "No pudimos cargar los workspaces. Inténtalo de nuevo."),
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingWorkspaces(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadWorkspaces();
    return () => {
      workspacesAbortRef.current?.abort();
    };
  }, [loadWorkspaces]);

  async function switchWorkspace(organizationId: string) {
    if (organizationId === workspace?.id || switchingWorkspace || saving || archiving) return;
    workspaceSwitchGenerationRef.current += 1;
    setSwitchingWorkspace(true);
    setSelected(null);
    setApplications([]);
    setCredentialDialogOpen(false);
    setGeneratedCredential(null);
    try {
      const res = await authClient.organization.setActive({ organizationId });
      if (res?.error) {
        toast.error("No pudimos cambiar el workspace. Inténtalo de nuevo.");
        void loadApplications(workspace?.id);
      }
    } catch {
      toast.error("No pudimos cambiar el workspace. Inténtalo de nuevo.");
      void loadApplications(workspace?.id);
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  const loadApplications = useCallback(async (organizationId?: string) => {
    if (!organizationId) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const { data } = await httpClient.get<Application[]>(
        `/organizations/${organizationId}/applications`,
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted ||
        activeWorkspaceIdRef.current !== organizationId ||
        data.some((app) => app.organizationId !== activeWorkspaceIdRef.current)
      ) {
        return;
      }
      setApplications(data);
    } catch (loadError) {
      if (controller.signal.aborted || activeWorkspaceIdRef.current !== organizationId) {
        return;
      }
      setError(
        errorMessage(loadError, "No pudimos cargar las aplicaciones. Inténtalo nuevamente."),
      );
    } finally {
      if (!controller.signal.aborted && activeWorkspaceIdRef.current === organizationId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    workspaceSwitchGenerationRef.current += 1;
    setSelected(null);
    setApplications([]);
    setCredentialDialogOpen(false);
    setGeneratedCredential(null);
    if (workspaceMissing) {
      return;
    }
    void loadApplications(workspace?.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [workspace?.id, workspaceMissing, loadApplications]);

  function openCreateWorkspace() {
    setNewWorkspaceName("");
    setWorkspaceError("");
    setWorkspaceDialogOpen(true);
  }

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newWorkspaceName.trim();
    if (!trimmedName) {
      setWorkspaceError("Ingresa un nombre para el workspace.");
      return;
    }
    setWorkspaceError("");
    setCreatingWorkspace(true);
    try {
      let createdOrg: { id: string } | null = null;
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const slug = generateWorkspaceSlug(trimmedName);
        const res = await authClient.organization.create({
          name: trimmedName,
          slug,
        });

        if (res?.error) {
          const isSlugTaken =
            res.error.code === "ORGANIZATION_SLUG_ALREADY_TAKEN" ||
            res.error.message === "Organization slug already taken";

          if (isSlugTaken && attempt < maxRetries - 1) {
            continue;
          }

          toast.error(res.error.message || "No pudimos crear el workspace. Inténtalo nuevamente.");
          return;
        }

        createdOrg = res?.data ?? null;
        break;
      }

      if (!createdOrg?.id) {
        toast.error("No pudimos crear el workspace. Inténtalo nuevamente.");
        return;
      }

      const activeRes = await authClient.organization.setActive({
        organizationId: createdOrg.id,
      });

      if (activeRes?.error) {
        toast.error(
          activeRes.error.message || "No pudimos activar el workspace. Inténtalo nuevamente.",
        );
        void loadWorkspaces();
        setNewWorkspaceName("");
        setCreatingWorkspace(false);
        setWorkspaceDialogOpen(false);
        return;
      }

      toast.success("Workspace creado.");
      void loadWorkspaces();
      setNewWorkspaceName("");
      setCreatingWorkspace(false);
      setWorkspaceDialogOpen(false);
    } catch (createError) {
      toast.error(
        errorMessage(createError, "No pudimos crear el workspace. Inténtalo nuevamente."),
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setSaving(true);
    try {
      const { data } = await httpClient.post<Application>(
        `/organizations/${workspace.id}/applications`,
        { name },
      );
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      setApplications((items) => [...items, data]);
      setSelected(data);
      setName("");
      setAppDialogOpen(false);
      toast.success("Aplicación creada.");
    } catch (createError) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(createError, "No pudimos crear la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function renameApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setSaving(true);
    try {
      const { data } = await httpClient.patch<Application>(`/applications/${selected.id}`, {
        name,
      });
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      setApplications((items) => items.map((item) => (item.id === data.id ? data : item)));
      setSelected(data);
      setName("");
      setAppDialogOpen(false);
      toast.success("Nombre actualizado.");
    } catch (renameError) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(renameError, "No pudimos actualizar la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setName("");
    setAppDialogOpen(true);
  }
  function openRename() {
    setName(selected?.name ?? "");
    setAppDialogOpen(true);
  }

  async function archiveApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setArchiving(true);
    try {
      const { data } = await httpClient.post<Application>(`/applications/${selected.id}/archive`);
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      setApplications((items) => items.filter((item) => item.id !== data.id));
      setSelected(data);
      setArchiveDialogOpen(false);
      toast.success("Aplicación archivada.");
    } catch (archiveError) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(archiveError, "No pudimos archivar la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setArchiving(false);
    }
  }

  async function openApplication(id: string) {
    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    try {
      const { data } = await httpClient.get<Application>(`/applications/${id}`);
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen ||
        data.organizationId !== activeWorkspaceIdRef.current
      ) {
        return;
      }
      setSelected(data);
    } catch (detailError) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(detailError, "No pudimos cargar la aplicación. Inténtalo nuevamente."),
      );
    }
  }

  function openGenerateCredential() {
    setGeneratedCredential(null);
    setCredentialDialogOpen(true);
  }

  function closeCredentialDialog() {
    setCredentialDialogOpen(false);
    setGeneratedCredential(null);
  }

  async function generateCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const applicationId = selected.id;
    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setGeneratingCredential(true);
    try {
      const { data } = await httpClient.post<{ credential: GeneratedCredential }>(
        `/applications/${applicationId}/sdk-credentials`,
      );
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      setGeneratedCredential(data.credential);
      toast.success("Credencial generada.");
    } catch (credentialError) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(credentialError, "No pudimos generar la credencial. Inténtalo nuevamente."),
      );
    } finally {
      setGeneratingCredential(false);
    }
  }

  async function copyCredential() {
    if (!generatedCredential) return;
    try {
      await navigator.clipboard.writeText(generatedCredential.secret);
      toast.success("Credencial copiada.");
    } catch {
      toast.error("No pudimos copiar la credencial. Inténtalo de nuevo.");
    }
  }

  function openRegisterModel() {
    setModelName("");
    setModelError("");
    setRegisterModelDialogOpen(true);
  }

  async function registerModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = modelName.trim();
    if (!trimmedName) {
      setModelError("Ingresa un nombre para el modelo.");
      return;
    }
    if (!selected) return;

    const orgId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setRegisteringModel(true);
    try {
      await httpClient.post(`/applications/${selected.id}/models`, {
        name: trimmedName,
        runtime: "tensorflow_lite",
      });
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.success("Modelo registrado.");
      setRegisterModelDialogOpen(false);
      setModelName("");
      setModelError("");
    } catch (err) {
      if (
        activeWorkspaceIdRef.current !== orgId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(err, "No pudimos registrar el modelo. Inténtalo nuevamente."),
      );
    } finally {
      setRegisteringModel(false);
    }
  }

  if ((!workspace && !organization.isPending) || workspaceMissing) {
    if (loadingWorkspaces) {
      return (
        <DashboardShell
          userName={userName}
          workspaces={workspaces}
          loadingWorkspaces={loadingWorkspaces}
          workspacesError={workspacesError}
          switchingWorkspace={switchingWorkspace}
          activeView={view}
          onSelectWorkspace={switchWorkspace}
          onViewChange={setView}
          onRetryWorkspaces={loadWorkspaces}
          onCreateWorkspace={openCreateWorkspace}
          membersDisabled={!workspace || workspaceMissing}
        >
          <main className="applications-page">
            <div className="applications-empty">
              <h1>Aplicaciones</h1>
              <p>Cargando workspace…</p>
              <Button data-testid="create-workspace-trigger" onClick={openCreateWorkspace}>
                <IconCirclePlus />
                Crear workspace
              </Button>
            </div>
          </main>
          <CreateWorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={setWorkspaceDialogOpen}
            workspaceName={newWorkspaceName}
            setWorkspaceName={setNewWorkspaceName}
            workspaceError={workspaceError}
            setWorkspaceError={setWorkspaceError}
            creatingWorkspace={creatingWorkspace}
            onSubmit={createWorkspace}
          />
        </DashboardShell>
      );
    }

    if (workspacesError) {
      return (
        <DashboardShell
          userName={userName}
          workspaces={workspaces}
          loadingWorkspaces={loadingWorkspaces}
          workspacesError={workspacesError}
          switchingWorkspace={switchingWorkspace}
          activeView={view}
          onSelectWorkspace={switchWorkspace}
          onViewChange={setView}
          onRetryWorkspaces={loadWorkspaces}
          onCreateWorkspace={openCreateWorkspace}
          membersDisabled={!workspace || workspaceMissing}
        >
          <main className="applications-page">
            <div className="applications-empty">
              <h1>Aplicaciones</h1>
              <p>{workspacesError}</p>
              <Button onClick={loadWorkspaces}>
                <IconRefresh />
                Reintentar
              </Button>
            </div>
          </main>
          <CreateWorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={setWorkspaceDialogOpen}
            workspaceName={newWorkspaceName}
            setWorkspaceName={setNewWorkspaceName}
            workspaceError={workspaceError}
            setWorkspaceError={setWorkspaceError}
            creatingWorkspace={creatingWorkspace}
            onSubmit={createWorkspace}
          />
        </DashboardShell>
      );
    }

    if (workspaces.length === 0) {
      return (
        <DashboardShell
          userName={userName}
          workspaces={workspaces}
          loadingWorkspaces={loadingWorkspaces}
          workspacesError={workspacesError}
          switchingWorkspace={switchingWorkspace}
          activeView={view}
          onSelectWorkspace={switchWorkspace}
          onViewChange={setView}
          onRetryWorkspaces={loadWorkspaces}
          onCreateWorkspace={openCreateWorkspace}
          membersDisabled={!workspace || workspaceMissing}
        >
          <main className="applications-page">
            <div className="applications-empty">
              <h1>Aplicaciones</h1>
              <p>Aún no perteneces a ningún workspace.</p>
              <Button data-testid="create-workspace-trigger" onClick={openCreateWorkspace}>
                <IconCirclePlus />
                Crear workspace
              </Button>
            </div>
          </main>
          <CreateWorkspaceDialog
            open={workspaceDialogOpen}
            onOpenChange={setWorkspaceDialogOpen}
            workspaceName={newWorkspaceName}
            setWorkspaceName={setNewWorkspaceName}
            workspaceError={workspaceError}
            setWorkspaceError={setWorkspaceError}
            creatingWorkspace={creatingWorkspace}
            onSubmit={createWorkspace}
          />
        </DashboardShell>
      );
    }

    return (
      <DashboardShell
        userName={userName}
        workspaces={workspaces}
        loadingWorkspaces={loadingWorkspaces}
        workspacesError={workspacesError}
        switchingWorkspace={switchingWorkspace}
        activeView={view}
        onSelectWorkspace={switchWorkspace}
        onViewChange={setView}
        onRetryWorkspaces={loadWorkspaces}
        onCreateWorkspace={openCreateWorkspace}
        membersDisabled={!workspace || workspaceMissing}
      >
        <main className="applications-page">
          <div className="applications-empty">
            <h1>Aplicaciones</h1>
            <p>No tienes un workspace activo. Selecciona un workspace para comenzar.</p>
          </div>
        </main>
        <CreateWorkspaceDialog
          open={workspaceDialogOpen}
          onOpenChange={setWorkspaceDialogOpen}
          workspaceName={newWorkspaceName}
          setWorkspaceName={setNewWorkspaceName}
          workspaceError={workspaceError}
          setWorkspaceError={setWorkspaceError}
          creatingWorkspace={creatingWorkspace}
          onSubmit={createWorkspace}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      userName={userName}
      workspaceName={workspace?.name}
      workspaces={workspaces}
      loadingWorkspaces={loadingWorkspaces}
      workspacesError={workspacesError}
      switchingWorkspace={switchingWorkspace}
      activeView={view}
      onSelectWorkspace={switchWorkspace}
      onViewChange={setView}
      onRetryWorkspaces={loadWorkspaces}
      onCreateWorkspace={openCreateWorkspace}
      membersDisabled={!workspace || workspaceMissing}
    >
      <main className="applications-page">
        {view === "members" && workspace ? (
          <MembersPanel
            key={workspace.id}
            workspaceId={workspace.id}
            workspaceName={workspace?.name ?? ""}
            canManage={canManage}
          />
        ) : (
          <>
            <header className="applications-header">
              <div>
                <p>{workspace?.name ?? "Cargando workspace…"}</p>
                <h1>{selected ? selected.name : "Aplicaciones"}</h1>
              </div>
              {!selected && canManage && (
                <Button onClick={openCreate}>
                  <IconCirclePlus />
                  Nueva aplicación
                </Button>
              )}
            </header>
            {selected ? (
              <section className="application-detail" aria-live="polite">
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  <IconArrowLeft />
                  Aplicaciones
                </Button>
                <div className="detail-heading">
                  <div>
                    <span>ID de aplicación</span>
                    <code>{selected.id}</code>
                  </div>
                  <span className="application-status">
                    {selected.status === "active" ? "Activa" : "Archivada"}
                  </span>
                </div>
                {canManage && (
                  <Button variant="outline" onClick={openRename}>
                    <IconPencil />
                    Editar nombre
                  </Button>
                )}
                {canManage && selected.status === "active" && (
                  <Button variant="outline" onClick={() => setArchiveDialogOpen(true)}>
                    <IconArchive />
                    Archivar aplicación
                  </Button>
                )}
                <div className="application-sections">
                  <section>
                    <h2>Workflows</h2>
                    <p>Aún no hay workflows configurados.</p>
                  </section>
                  <section>
                    <div className="application-section-heading">
                      <h2>Modelos</h2>
                      {canManage && selected.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="register-model-trigger"
                          onClick={openRegisterModel}
                        >
                          Registrar modelo
                        </Button>
                      )}
                    </div>
                    <p>Aún no hay modelos configurados.</p>
                  </section>
                  <section>
                    <div className="application-section-heading">
                      <h2>Credenciales SDK</h2>
                      {canManage && selected.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid="generate-credential-trigger"
                          onClick={openGenerateCredential}
                        >
                          Generar credencial
                        </Button>
                      )}
                    </div>
                    <p>Genera una credencial para autenticar al SDK de esta aplicación.</p>
                  </section>
                  <section>
                    <h2>Datasets</h2>
                    <p>Aún no hay datasets configurados.</p>
                  </section>
                  <section>
                    <h2>Telemetría</h2>
                    <p>La telemetría estará disponible cuando la aplicación la configure.</p>
                  </section>
                </div>
              </section>
            ) : (
              <section className="applications-list" aria-live="polite">
                {loading ? (
                  <p>Cargando aplicaciones…</p>
                ) : error ? (
                  <div className="applications-error">
                    <p>{error}</p>
                    <Button variant="outline" onClick={() => void loadApplications(workspace?.id)}>
                      <IconRefresh />
                      Reintentar
                    </Button>
                  </div>
                ) : applications.length === 0 ? (
                  <div className="applications-empty">
                    <h2>Aún no hay aplicaciones en este workspace.</h2>
                    {canManage && <Button onClick={openCreate}>Crear aplicación</Button>}
                  </div>
                ) : (
                  <ul>
                    {applications.map((application) => (
                      <li key={application.id}>
                        <button type="button" onClick={() => void openApplication(application.id)}>
                          <strong>{application.name}</strong>
                          <code>{application.id}</code>
                        </button>
                        <span className="application-status">
                          {application.status === "active" ? "Activa" : "Archivada"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
        <Dialog
          open={appDialogOpen}
          onOpenChange={(open) => {
            setAppDialogOpen(open);
            if (!open) setName("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selected ? "Editar nombre de la aplicación" : "Crear aplicación"}
              </DialogTitle>
              {!selected && (
                <DialogDescription>Usa un nombre que tu equipo pueda reconocer.</DialogDescription>
              )}
            </DialogHeader>
            <form
              onSubmit={selected ? renameApplication : createApplication}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="application-name" className="font-semibold text-sm">
                  Nombre de la aplicación
                </label>
                <Input
                  id="application-name"
                  autoFocus
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAppDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? selected
                      ? "Guardando cambios…"
                      : "Creando aplicación…"
                    : selected
                      ? "Guardar cambios"
                      : "Crear aplicación"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Archivar &quot;{selected?.name}&quot;?</DialogTitle>
              <DialogDescription>
                La aplicación dejará de sincronizar recursos nuevos. Sus workflows y modelos se
                conservarán.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={archiveApplication} className="flex flex-col gap-4">
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setArchiveDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={archiving}>
                  {archiving ? "Archivando aplicación…" : "Archivar aplicación"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <GenerateCredentialDialog
          open={credentialDialogOpen}
          onOpenChange={(open) => {
            if (open) setCredentialDialogOpen(true);
            else closeCredentialDialog();
          }}
          onDiscard={closeCredentialDialog}
          generated={generatedCredential}
          generating={generatingCredential}
          onGenerate={generateCredential}
          onCopy={() => void copyCredential()}
        />
        <RegisterModelDialog
          open={registerModelDialogOpen}
          onOpenChange={setRegisterModelDialogOpen}
          modelName={modelName}
          setModelName={setModelName}
          modelError={modelError}
          setModelError={setModelError}
          registering={registeringModel}
          onSubmit={registerModel}
        />
        <CreateWorkspaceDialog
          open={workspaceDialogOpen}
          onOpenChange={setWorkspaceDialogOpen}
          workspaceName={newWorkspaceName}
          setWorkspaceName={setNewWorkspaceName}
          workspaceError={workspaceError}
          setWorkspaceError={setWorkspaceError}
          creatingWorkspace={creatingWorkspace}
          onSubmit={createWorkspace}
        />
      </main>
    </DashboardShell>
  );
}
