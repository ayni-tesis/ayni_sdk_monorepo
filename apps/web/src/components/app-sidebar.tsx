"use client";

import { IconApps, IconUsers } from "@tabler/icons-react";
import Link from "next/link";

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

export type DashboardView = "applications" | "members";

export function AppSidebar({
  workspaceName,
  activeView = "applications",
  membersDisabled = false,
  onViewChange,
}: {
  workspaceName?: string;
  activeView?: DashboardView;
  membersDisabled?: boolean;
  onViewChange?: (view: DashboardView) => void;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            A
          </span>
          <span>Ayni</span>
        </Link>
        <span className="truncate px-2 text-muted-foreground text-sm">
          {workspaceName ?? "Workspace"}
        </span>
      </SidebarHeader>
      <SidebarContent>
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
      </SidebarContent>
      <SidebarFooter className="p-3 text-muted-foreground text-xs">
        Offline-first · SDK Flutter
      </SidebarFooter>
    </Sidebar>
  );
}
