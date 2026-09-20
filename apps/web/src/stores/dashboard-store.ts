import { create } from "zustand";
import type { Application, WorkspaceItem } from "@/app/dashboard/types";

export type DashboardStoreState = {
  organizationId: string | null;
  workspaces: WorkspaceItem[];
  loadingWorkspaces: boolean;
  workspacesError: string;
  applications: Application[];
  loadingApplications: boolean;
  applicationsError: string;
  appCache: Record<string, Application>;
};

export const initialDashboardState: DashboardStoreState = {
  organizationId: null,
  workspaces: [],
  loadingWorkspaces: true,
  workspacesError: "",
  applications: [],
  loadingApplications: false,
  applicationsError: "",
  appCache: {},
};

type DashboardStoreActions = {
  setOrganizationId: (organizationId: string | null) => void;
  setWorkspaces: (workspaces: WorkspaceItem[]) => void;
  setLoadingWorkspaces: (loadingWorkspaces: boolean) => void;
  setWorkspacesError: (workspacesError: string) => void;
  setApplications: (applications: Application[]) => void;
  setLoadingApplications: (loadingApplications: boolean) => void;
  setApplicationsError: (applicationsError: string) => void;
  cacheApplication: (application: Application) => void;
  addApplication: (application: Application) => void;
  updateApplication: (application: Application) => void;
  removeApplication: (applicationId: string) => void;
};

export type DashboardStore = DashboardStoreState & DashboardStoreActions;

export const useDashboardStore = create<DashboardStore>()((set) => ({
  ...initialDashboardState,

  setOrganizationId: (organizationId) =>
    set((state) =>
      state.organizationId === organizationId
        ? state
        : {
            organizationId,
            applications: [],
            loadingApplications: false,
            applicationsError: "",
            appCache: {},
          },
    ),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setLoadingWorkspaces: (loadingWorkspaces) => set({ loadingWorkspaces }),
  setWorkspacesError: (workspacesError) => set({ workspacesError }),
  setApplications: (applications) => set({ applications }),
  setLoadingApplications: (loadingApplications) => set({ loadingApplications }),
  setApplicationsError: (applicationsError) => set({ applicationsError }),
  cacheApplication: (application) =>
    set((state) => ({
      appCache: { ...state.appCache, [application.id]: application },
    })),
  addApplication: (application) =>
    set((state) => ({
      applications: [...state.applications, application],
      appCache: { ...state.appCache, [application.id]: application },
    })),
  updateApplication: (application) =>
    set((state) => ({
      applications: state.applications.map((item) =>
        item.id === application.id ? application : item,
      ),
      appCache: { ...state.appCache, [application.id]: application },
    })),
  removeApplication: (applicationId) =>
    set((state) => ({
      applications: state.applications.filter((item) => item.id !== applicationId),
    })),
}));
