"use client";

import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import {
  IconActivity,
  IconApps,
  IconCpu,
  IconDatabase,
  IconGitBranch,
  IconKey,
  IconLayoutDashboard,
  IconPhotoShield,
  IconSettings,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import type { Application, DashboardView, WorkspaceItem } from "@/app/dashboard/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from "@/components/workspace-switcher";

export type { DashboardView } from "@/app/dashboard/types";

const mobileNavigationTargetClass = "min-h-11 md:min-h-0";

export type AppSidebarProps = {
  workspaceName?: string;
  activeView?: DashboardView;
  membersDisabled?: boolean;
  onViewChange?: (view: DashboardView) => void;
  selectedApplication?: Application | null;
  onSelectApplication?: (app: Application | null) => void;
  switcherProps?: WorkspaceSwitcherProps;

  workspaces?: WorkspaceItem[];
  activeWorkspaceId?: string;
  role?: string;
  loadingWorkspaces?: boolean;
  workspacesError?: string;
  switchingWorkspace?: boolean;
  onSelectWorkspace?: (id: string) => void;
  onRetryWorkspaces?: () => void;
  onWorkspaceCreated?: (newWorkspaceId: string) => Promise<void> | void;
  createDialogOpen?: boolean;
  onOpenCreateDialog?: () => void;
  onCloseCreateDialog?: () => void;
};

export function AppSidebar({
  workspaceName,
  activeView = "applications",
  membersDisabled = false,
  onViewChange,
  selectedApplication,
  onSelectApplication,
  switcherProps,
  workspaces = [],
  activeWorkspaceId,
  role,
  loadingWorkspaces = false,
  workspacesError = "",
  switchingWorkspace = false,
  onSelectWorkspace,
  onRetryWorkspaces,
  onWorkspaceCreated,
  createDialogOpen,
  onOpenCreateDialog,
  onCloseCreateDialog,
}: AppSidebarProps) {
  const effectiveSwitcherProps: WorkspaceSwitcherProps = switcherProps ?? {
    workspaces,
    activeWorkspaceId,
    workspaceName,
    role,
    loadingWorkspaces,
    workspacesError,
    switchingWorkspace,
    onSelectWorkspace,
    onRetryWorkspaces,
    onWorkspaceCreated,
    createDialogOpen,
    onOpenCreateDialog,
    onCloseCreateDialog,
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <WorkspaceSwitcher {...effectiveSwitcherProps} />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navegación principal">
          {selectedApplication ? (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>Aplicación</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "overview"}
                      aria-current={activeView === "overview" ? "page" : undefined}
                      tooltip="Resumen"
                      onClick={() => onViewChange?.("overview")}
                    >
                      <IconLayoutDashboard />
                      <span>Resumen</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "workflows"}
                      aria-current={activeView === "workflows" ? "page" : undefined}
                      tooltip="Workflows"
                      onClick={() => onViewChange?.("workflows")}
                    >
                      <IconGitBranch />
                      <span>Workflows</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "models"}
                      aria-current={activeView === "models" ? "page" : undefined}
                      tooltip="Modelos"
                      onClick={() => onViewChange?.("models")}
                    >
                      <IconCpu />
                      <span>Modelos</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "datasets"}
                      aria-current={activeView === "datasets" ? "page" : undefined}
                      tooltip="Datasets de validación"
                      onClick={() => onViewChange?.("datasets")}
                    >
                      <IconDatabase />
                      <span>Datasets de validación</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "credentials"}
                      aria-current={activeView === "credentials" ? "page" : undefined}
                      tooltip="Credenciales SDK"
                      onClick={() => onViewChange?.("credentials")}
                    >
                      <IconKey />
                      <span>Credenciales SDK</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "privacy"}
                      aria-current={activeView === "privacy" ? "page" : undefined}
                      tooltip="Privacidad y datos"
                      onClick={() => onViewChange?.("privacy")}
                    >
                      <IconShieldLock />
                      <span>Privacidad y datos</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "collection"}
                      aria-current={activeView === "collection" ? "page" : undefined}
                      tooltip="Recolección de evidencia"
                      onClick={() => onViewChange?.("collection")}
                    >
                      <IconPhotoShield />
                      <span>Recolección de evidencia</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "traces"}
                      aria-current={activeView === "traces" ? "page" : undefined}
                      tooltip="Trazas"
                      onClick={() => onViewChange?.("traces")}
                    >
                      <IconActivity />
                      <span>Trazas</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "settings"}
                      aria-current={activeView === "settings" ? "page" : undefined}
                      tooltip="Configuración"
                      onClick={() => onViewChange?.("settings")}
                    >
                      <IconSettings />
                      <span>Configuración</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Espacio de trabajo</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={false}
                      tooltip="Todas las aplicaciones"
                      onClick={() => onSelectApplication?.(null)}
                    >
                      <IconApps />
                      <span>Todas las aplicaciones</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className={mobileNavigationTargetClass}
                      isActive={activeView === "members"}
                      aria-current={activeView === "members" ? "page" : undefined}
                      tooltip="Miembros"
                      disabled={membersDisabled}
                      onClick={() => {
                        if (!membersDisabled) onViewChange?.("members");
                      }}
                    >
                      <IconUsers />
                      <span>Miembros</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>Espacio de trabajo</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={mobileNavigationTargetClass}
                    isActive={activeView === "applications"}
                    aria-current={activeView === "applications" ? "page" : undefined}
                    tooltip="Aplicaciones"
                    onClick={() => onViewChange?.("applications")}
                  >
                    <IconApps />
                    <span>Aplicaciones</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={mobileNavigationTargetClass}
                    isActive={activeView === "members"}
                    aria-current={activeView === "members" ? "page" : undefined}
                    tooltip="Miembros"
                    disabled={membersDisabled}
                    onClick={() => {
                      if (!membersDisabled) onViewChange?.("members");
                    }}
                  >
                    <IconUsers />
                    <span>Miembros</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter className="p-3 text-sidebar-accent-foreground text-xs">
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4 transition-colors motion-reduce:duration-0 hover:decoration-sidebar-primary md:min-h-0"
          href={`/privacy/ayni/${AYNI_PRIVACY_NOTICE.version}` as Route}
        >
          Aviso de privacidad de Ayni
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
