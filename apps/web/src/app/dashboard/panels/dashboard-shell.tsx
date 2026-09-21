"use client";

import { AppSidebar, type DashboardView } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { WorkspaceSwitcherProps } from "@/components/workspace-switcher";
import type { Application } from "../types";
import { WorkspaceHeader, type WorkspaceHeaderProps } from "./workspace-header";

export type DashboardShellProps = {
  children: React.ReactNode;
  activeView?: DashboardView;
  membersDisabled?: boolean;
  onViewChange?: (view: DashboardView) => void;
  selectedApplication?: Application | null;
  applications?: Application[];
  onSelectApplication?: (id: string) => void;
  onClearApplication?: () => void;
  headerProps: WorkspaceHeaderProps;
  switcherProps: WorkspaceSwitcherProps;
};

export function DashboardShell({
  children,
  activeView = "applications",
  membersDisabled = false,
  onViewChange,
  selectedApplication,
  applications,
  onSelectApplication,
  onClearApplication,
  headerProps,
  switcherProps,
}: DashboardShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        activeView={activeView}
        membersDisabled={membersDisabled}
        onViewChange={onViewChange}
        selectedApplication={selectedApplication}
        onSelectApplication={(app) => {
          if (app) onSelectApplication?.(app.id);
          else onClearApplication?.();
        }}
        switcherProps={switcherProps}
      />
      <SidebarInset>
        <WorkspaceHeader
          {...headerProps}
          selectedApplication={selectedApplication}
          applications={applications}
          activeView={activeView}
          onSelectApplication={onSelectApplication}
          onNavigateHome={onClearApplication}
        />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
