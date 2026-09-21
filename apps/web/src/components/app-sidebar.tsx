"use client";

import {
  IconApps,
  IconCpu,
  IconGitBranch,
  IconKey,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
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
        {selectedApplication ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Aplicación</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "overview"}
                    tooltip="Resumen"
                    onClick={() => onViewChange?.("overview")}
                  >
                    <IconLayoutDashboard />
                    <span>Resumen</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "workflows"}
                    tooltip="Workflows"
                    onClick={() => onViewChange?.("workflows")}
                  >
                    <IconGitBranch />
                    <span>Workflows</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "models"}
                    tooltip="Modelos"
                    onClick={() => onViewChange?.("models")}
                  >
                    <IconCpu />
                    <span>Modelos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "credentials"}
                    tooltip="Credenciales SDK"
                    onClick={() => onViewChange?.("credentials")}
                  >
                    <IconKey />
                    <span>Credenciales SDK</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeView === "settings"}
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
                    isActive={activeView === "members"}
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
                  isActive={activeView === "applications"}
                  tooltip="Aplicaciones"
                  onClick={() => onViewChange?.("applications")}
                >
                  <IconApps />
                  <span>Aplicaciones</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeView === "members"}
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
      </SidebarContent>
      <SidebarFooter className="p-3 text-muted-foreground text-xs">
        Offline-first · SDK Flutter
      </SidebarFooter>
    </Sidebar>
  );
}
