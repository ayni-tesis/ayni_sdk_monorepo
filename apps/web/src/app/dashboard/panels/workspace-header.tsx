"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { DashboardView } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Application } from "../types";

export type WorkspaceHeaderProps = {
  userName: string;
  workspaceName?: string;
  selectedApplication?: Application | null;
  applications?: Application[];
  activeView?: DashboardView;
  onSelectApplication?: (id: string) => void;
  onNavigateHome?: () => void;
};

function activeViewLabel(view: DashboardView): string {
  switch (view) {
    case "workflows":
      return "Workflows";
    case "models":
      return "Modelos";
    case "credentials":
      return "Credenciales SDK";
    case "settings":
      return "Configuración";
    case "members":
      return "Miembros";
    case "applications":
    case "overview":
      return "Aplicaciones";
  }
}

export function WorkspaceHeader({
  userName,
  workspaceName,
  selectedApplication,
  applications = [],
  activeView = "applications",
  onSelectApplication,
  onNavigateHome,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex min-h-15 items-center justify-between gap-4 border-b px-4">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger />
        <span className="text-muted-foreground text-sm">Workspace actual</span>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {selectedApplication ? (
                <BreadcrumbLink
                  href="/dashboard"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigateHome?.();
                  }}
                >
                  {workspaceName ?? "Workspace"}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{workspaceName ?? "Workspace"}</BreadcrumbPage>
              )}
            </BreadcrumbItem>

            {selectedApplication && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {applications && applications.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1 font-semibold text-foreground transition-opacity hover:opacity-80">
                        <span className="max-w-48 truncate">{selectedApplication.name}</span>
                        <IconChevronDown className="size-3.5 opacity-50" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel className="text-muted-foreground text-xs">
                          Aplicaciones
                        </DropdownMenuLabel>
                        {applications.map((app) => (
                          <DropdownMenuItem
                            key={app.id}
                            onClick={() => onSelectApplication?.(app.id)}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{app.name}</span>
                            {app.id === selectedApplication.id && (
                              <span className="font-medium text-primary text-xs">Activa</span>
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onNavigateHome?.()}>
                          Ver todas las aplicaciones
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="max-w-48 truncate font-semibold text-foreground">
                      {selectedApplication.name}
                    </span>
                  )}
                </BreadcrumbItem>
              </>
            )}

            {((selectedApplication && activeView !== "applications" && activeView !== "overview") ||
              !selectedApplication) && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeViewLabel(activeView)}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <span className="shrink-0 truncate text-muted-foreground text-sm">{userName}</span>
    </header>
  );
}
