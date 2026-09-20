"use client";

import { IconCirclePlus, IconRefresh } from "@tabler/icons-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DashboardView } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import { useDashboardStore } from "@/stores/dashboard-store";
import "./dashboard.css";
import type { ApplicationSection } from "./panels/application-detail-panel";
import { ApplicationDetailPanel } from "./panels/application-detail-panel";
import { ApplicationsPanel } from "./panels/applications-panel";
import { DashboardShell } from "./panels/dashboard-shell";
import { MembersPanel } from "./panels/members-panel";
import type { Application, WorkspaceItem } from "./types";

export type DashboardProps = {
  userName: string;
};

export type DashboardRoute =
  | { kind: "list" }
  | { kind: "members" }
  | { kind: "app"; id: string; section: ApplicationSection };

const SECTION_SEGMENT: Record<ApplicationSection, string | null> = {
  overview: null,
  workflows: "workflows",
  models: "models",
  credentials: "credentials",
  settings: "settings",
};

export function parseDashboardRoute(pathname: string | null): DashboardRoute {
  if (pathname === "/dashboard/members") return { kind: "members" };
  const match = pathname?.match(
    /^\/dashboard\/applications\/([^/]+)(?:\/(workflows|models|credentials|settings))?\/?$/,
  );
  if (match) {
    const section = (match[2] ?? "overview") as ApplicationSection;
    return { kind: "app", id: decodeURIComponent(match[1]), section };
  }
  return { kind: "list" };
}

function pathForView(view: DashboardView, appId?: string | null): Route {
  if (view === "members") return "/dashboard/members" as Route;
  if (view === "applications" || !appId) return "/dashboard" as Route;
  const segment = SECTION_SEGMENT[view as ApplicationSection];
  const base = `/dashboard/applications/${appId}`;
  return (segment ? `${base}/${segment}` : base) as Route;
}

export default function Dashboard({ userName }: DashboardProps) {
  const organization = authClient.useActiveOrganization();
  const memberRole = authClient.useActiveMemberRole();
  const router = useRouter();
  const pathname = usePathname();
  const route = parseDashboardRoute(pathname);

  const workspaces = useDashboardStore((state) => state.workspaces);
  const loadingWorkspaces = useDashboardStore((state) => state.loadingWorkspaces);
  const workspacesError = useDashboardStore((state) => state.workspacesError);
  const applications = useDashboardStore((state) => state.applications);
  const loading = useDashboardStore((state) => state.loadingApplications);
  const error = useDashboardStore((state) => state.applicationsError);
  const appCache = useDashboardStore((state) => state.appCache);
  const setOrganizationId = useDashboardStore((state) => state.setOrganizationId);
  const setWorkspaces = useDashboardStore((state) => state.setWorkspaces);
  const setLoadingWorkspaces = useDashboardStore((state) => state.setLoadingWorkspaces);
  const setWorkspacesError = useDashboardStore((state) => state.setWorkspacesError);
  const setApplications = useDashboardStore((state) => state.setApplications);
  const setLoadingApplications = useDashboardStore((state) => state.setLoadingApplications);
  const setApplicationsError = useDashboardStore((state) => state.setApplicationsError);
  const cacheApplication = useDashboardStore((state) => state.cacheApplication);
  const addApplication = useDashboardStore((state) => state.addApplication);
  const updateApplication = useDashboardStore((state) => state.updateApplication);
  const removeApplication = useDashboardStore((state) => state.removeApplication);

  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

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
  const detailInFlightRef = useRef<Record<string, boolean>>({});

  const go = useCallback(
    (view: DashboardView, appId?: string | null) => {
      const target = pathForView(view, appId);
      if (pathname && pathname !== target) {
        router.push(target, { scroll: false });
      }
    },
    [pathname, router],
  );

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
  }, [setLoadingWorkspaces, setWorkspaces, setWorkspacesError]);

  useEffect(() => {
    void loadWorkspaces();
    return () => {
      workspacesAbortRef.current?.abort();
    };
  }, [loadWorkspaces]);

  const loadApplications = useCallback(
    async (organizationId?: string) => {
      if (!organizationId) return;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoadingApplications(true);
      setApplicationsError("");
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
        setApplicationsError(
          errorMessage(loadError, "No pudimos cargar las aplicaciones. Inténtalo nuevamente."),
        );
      } finally {
        if (!controller.signal.aborted && activeWorkspaceIdRef.current === organizationId) {
          setLoadingApplications(false);
        }
      }
    },
    [setApplications, setApplicationsError, setLoadingApplications],
  );

  const prevWorkspaceIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== activeWorkspaceId) {
      workspaceSwitchGenerationRef.current += 1;
    }
    prevWorkspaceIdRef.current = activeWorkspaceId;
    setOrganizationId(activeWorkspaceId ?? null);
    if (workspaceMissing) {
      return;
    }
    void loadApplications(activeWorkspaceId);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [activeWorkspaceId, workspaceMissing, loadApplications, setOrganizationId]);

  const appId = route.kind === "app" ? route.id : null;
  useEffect(() => {
    if (!appId || !activeWorkspaceId || appCache[appId] || detailInFlightRef.current[appId]) {
      return;
    }
    const organizationAtStart = activeWorkspaceId;
    const switchGen = workspaceSwitchGenerationRef.current;
    detailInFlightRef.current[appId] = true;
    void (async () => {
      try {
        const { data } = await httpClient.get<Application>(`/applications/${appId}`);
        if (
          activeWorkspaceIdRef.current !== organizationAtStart ||
          workspaceSwitchGenerationRef.current !== switchGen
        ) {
          return;
        }
        if (data.organizationId !== activeWorkspaceIdRef.current) {
          go("applications");
          return;
        }
        cacheApplication(data);
      } catch (detailError) {
        if (
          activeWorkspaceIdRef.current !== organizationAtStart ||
          workspaceSwitchGenerationRef.current !== switchGen
        ) {
          return;
        }
        toast.error(
          errorMessage(detailError, "No pudimos cargar la aplicación. Inténtalo nuevamente."),
        );
        go("applications");
      } finally {
        detailInFlightRef.current[appId] = false;
      }
    })();
  }, [appId, activeWorkspaceId, appCache, cacheApplication, go]);

  function switchWorkspace(organizationId: string) {
    if (organizationId === workspace?.id || switchingWorkspace || saving || archiving) return;
    workspaceSwitchGenerationRef.current += 1;
    setSwitchingWorkspace(true);
    go("applications");
    setApplications([]);
    void (async () => {
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
    })();
  }

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
      addApplication(data);
      go("overview", data.id);
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

  function switchApplication(id: string) {
    go(route.kind === "app" ? route.section : "overview", id);
  }

  const handleViewChange = (nextView: DashboardView) => {
    if (nextView === "members" || nextView === "applications") {
      go(nextView);
      return;
    }
    if (route.kind === "app") {
      go(nextView, route.id);
    }
  };

  const selected = route.kind === "app" ? (appCache[route.id] ?? null) : null;
  const activeView: DashboardView =
    route.kind === "members" ? "members" : route.kind === "app" ? route.section : "applications";

  const switcherProps = {
    workspaces,
    activeWorkspaceId,
    role: memberRole.data?.role,
    workspaceName: workspace?.name,
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

  const headerProps = {
    userName,
    workspaceName: workspace?.name,
  };

  if ((!workspace && !organization.isPending) || workspaceMissing) {
    return (
      <DashboardShell
        activeView="applications"
        membersDisabled
        onViewChange={handleViewChange}
        selectedApplication={null}
        applications={[]}
        onSelectApplication={switchApplication}
        onClearApplication={() => go("applications")}
        headerProps={headerProps}
        switcherProps={switcherProps}
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
      activeView={activeView}
      membersDisabled={false}
      onViewChange={handleViewChange}
      selectedApplication={selected}
      applications={applications}
      onSelectApplication={switchApplication}
      onClearApplication={() => go("applications")}
      headerProps={headerProps}
      switcherProps={switcherProps}
    >
      <main className="applications-page">
        {activeView === "members" && workspace ? (
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
            activeSection={route.kind === "app" ? route.section : "overview"}
            onBack={() => go("applications")}
            onApplicationUpdated={updateApplication}
            onApplicationArchived={(archived) => {
              removeApplication(archived.id);
              cacheApplication(archived);
            }}
            onMutationStart={() => setSaving(true)}
            onMutationEnd={() => setSaving(false)}
            onArchiveStart={() => setArchiving(true)}
            onArchiveEnd={() => setArchiving(false)}
          />
        ) : route.kind === "app" && activeWorkspaceId ? (
          <div className="applications-page">
            <div className="applications-empty" data-testid="application-loading">
              <p>Cargando aplicación…</p>
            </div>
          </div>
        ) : (
          <ApplicationsPanel
            workspaceName={workspace?.name}
            applications={applications}
            loading={loading}
            error={error}
            canManage={canManage}
            isCreating={saving}
            onRetry={() => void loadApplications(workspace?.id)}
            onSelectApplication={switchApplication}
            onCreateApplication={handleCreateApplication}
          />
        )}
      </main>
    </DashboardShell>
  );
}
