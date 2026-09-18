"use client";

import {
  IconArchive,
  IconArrowLeft,
  IconChevronDown,
  IconCirclePlus,
  IconPencil,
  IconRefresh,
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
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import { generateWorkspaceSlug } from "@/lib/slug";
import "./dashboard.css";

type Application = {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "archived";
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback;
}

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

function MembersPanel({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  return (
    <section className="members-section" aria-live="polite">
      <header className="applications-header">
        <div>
          <p>{workspaceName}</p>
          <h1>Miembros</h1>
        </div>
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
              <span className="application-status">{formatWorkspaceRole(memberItem.role)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function formatWorkspaceRole(role: string): string {
  switch (role) {
    case "owner":
      return "Propietario";
    case "admin":
      return "Administrador";
    case "member":
      return "Miembro";
    default:
      return role;
  }
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

export default function Dashboard({ userName }: { userName: string }) {
  const organization = authClient.useActiveOrganization();
  const memberRole = authClient.useActiveMemberRole();
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
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
                    <h2>Modelos</h2>
                    <p>Aún no hay modelos configurados.</p>
                  </section>
                  <section>
                    <h2>Credenciales SDK</h2>
                    <p>Las credenciales no se muestran aquí.</p>
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
