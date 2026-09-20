"use client";

import { IconCirclePlus, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DashboardView } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import "./dashboard.css";
import { ApplicationDetailPanel } from "./panels/application-detail-panel";
import { ApplicationsPanel } from "./panels/applications-panel";
import { DashboardShell } from "./panels/dashboard-shell";
import { MembersPanel } from "./panels/members-panel";
import type { Application, WorkspaceItem } from "./types";

export type { WorkspaceItem } from "./types";

export default function Dashboard({ userName }: { userName: string }) {
  const organization = authClient.useActiveOrganization();
  const memberRole = authClient.useActiveMemberRole();

  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [workspacesError, setWorkspacesError] = useState("");
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [view, setView] = useState<DashboardView>("applications");
  const [selected, setSelected] = useState<Application | null>(null);
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

  async function handleCreateApplication(appName: string) {
    if (!workspace) return false;
    const activeWorkspaceId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    setSaving(true);
    try {
      const { data } = await httpClient.post<Application>(
        `/organizations/${workspace.id}/applications`,
        { name: appName },
      );
      if (
        activeWorkspaceIdRef.current !== activeWorkspaceId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return false;
      }
      setApplications((items) => [...items, data]);
      setSelected(data);
      toast.success("Aplicación creada.");
      return true;
    } catch (createError) {
      if (
        activeWorkspaceIdRef.current !== activeWorkspaceId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return false;
      }
      toast.error(
        errorMessage(createError, "No pudimos crear la aplicación. Inténtalo nuevamente."),
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openApplication(id: string) {
    const activeWorkspaceId = activeWorkspaceIdRef.current;
    const switchGen = workspaceSwitchGenerationRef.current;
    try {
      const { data } = await httpClient.get<Application>(`/applications/${id}`);
      if (
        activeWorkspaceIdRef.current !== activeWorkspaceId ||
        workspaceSwitchGenerationRef.current !== switchGen ||
        data.organizationId !== activeWorkspaceIdRef.current
      ) {
        return;
      }
      setSelected(data);
    } catch (detailError) {
      if (
        activeWorkspaceIdRef.current !== activeWorkspaceId ||
        workspaceSwitchGenerationRef.current !== switchGen
      ) {
        return;
      }
      toast.error(
        errorMessage(detailError, "No pudimos cargar la aplicación. Inténtalo nuevamente."),
      );
    }
  }

  function handleApplicationUpdated(updated: Application) {
    setApplications((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setSelected(updated);
  }

  function handleApplicationArchived(archived: Application) {
    setApplications((items) => items.filter((item) => item.id !== archived.id));
    setSelected(archived);
  }

  const headerProps = {
    userName,
    workspaceName: workspace?.name,
    workspaces,
    loadingWorkspaces,
    workspacesError,
    switchingWorkspace,
    onSelectWorkspace: switchWorkspace,
    onRetryWorkspaces: loadWorkspaces,
    onWorkspaceCreated: () => void loadWorkspaces(),
    createDialogOpen: workspaceDialogOpen,
    onOpenCreateDialog: () => setWorkspaceDialogOpen(true),
    onCloseCreateDialog: () => setWorkspaceDialogOpen(false),
  };

  if ((!workspace && !organization.isPending) || workspaceMissing) {
    return (
      <DashboardShell
        workspaceName={workspace?.name}
        activeView={view}
        membersDisabled={!workspace || workspaceMissing}
        onViewChange={setView}
        headerProps={headerProps}
      >
        <main className="applications-page">
          <div className="applications-empty">
            {loadingWorkspaces ? (
              <>
                <h1>Aplicaciones</h1>
                <p>Cargando workspace…</p>
                <Button
                  data-testid="create-workspace-trigger"
                  onClick={() => setWorkspaceDialogOpen(true)}
                >
                  <IconCirclePlus />
                  Crear workspace
                </Button>
              </>
            ) : workspacesError ? (
              <>
                <h1>Aplicaciones</h1>
                <p>{workspacesError}</p>
                <Button onClick={loadWorkspaces}>
                  <IconRefresh />
                  Reintentar
                </Button>
              </>
            ) : workspaces.length === 0 ? (
              <>
                <h1>Aplicaciones</h1>
                <p>Aún no perteneces a ningún workspace.</p>
                <Button
                  data-testid="create-workspace-trigger"
                  onClick={() => setWorkspaceDialogOpen(true)}
                >
                  <IconCirclePlus />
                  Crear workspace
                </Button>
              </>
            ) : (
              <>
                <h1>Aplicaciones</h1>
                <p>No tienes un workspace activo. Selecciona un workspace para comenzar.</p>
              </>
            )}
          </div>
        </main>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      workspaceName={workspace?.name}
      activeView={view}
      membersDisabled={!workspace || workspaceMissing}
      onViewChange={setView}
      headerProps={headerProps}
    >
      <main className="applications-page">
        {view === "members" && workspace ? (
          <MembersPanel
            key={workspace.id}
            workspaceId={workspace.id}
            workspaceName={workspace?.name ?? ""}
            canManage={canManage}
          />
        ) : selected ? (
          <ApplicationDetailPanel
            application={selected}
            workspaceName={workspace?.name}
            canManage={canManage}
            onBack={() => setSelected(null)}
            onApplicationUpdated={handleApplicationUpdated}
            onApplicationArchived={handleApplicationArchived}
            onMutationStart={() => setSaving(true)}
            onMutationEnd={() => setSaving(false)}
            onArchiveStart={() => setArchiving(true)}
            onArchiveEnd={() => setArchiving(false)}
          />
        ) : (
          <ApplicationsPanel
            workspaceName={workspace?.name}
            applications={applications}
            loading={loading}
            error={error}
            canManage={canManage}
            isCreating={saving}
            onRetry={() => void loadApplications(workspace?.id)}
            onSelectApplication={(id) => void openApplication(id)}
            onCreateApplication={handleCreateApplication}
          />
        )}
      </main>
    </DashboardShell>
  );
}
