"use client";

import { AppSidebar, type DashboardView } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceHeader, type WorkspaceHeaderProps } from "./workspace-header";

export type DashboardShellProps = {
  children: React.ReactNode;
  workspaceName?: string;
  activeView?: DashboardView;
  membersDisabled?: boolean;
  onViewChange?: (view: DashboardView) => void;
  headerProps: WorkspaceHeaderProps;
};

export function DashboardShell({
  children,
  workspaceName,
  activeView = "applications",
  membersDisabled = false,
  onViewChange,
  headerProps,
}: DashboardShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspaceName}
        activeView={activeView}
        membersDisabled={membersDisabled}
        onViewChange={onViewChange}
      />
      <SidebarInset>
        <WorkspaceHeader {...headerProps} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
