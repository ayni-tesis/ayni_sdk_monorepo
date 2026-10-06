"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconBook, IconChevronDown, IconHelpCircle } from "@tabler/icons-react";
import { DocsLink } from "@/components/docs-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { type Application, DASHBOARD_VIEWS, type DashboardView } from "../types";

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
  return DASHBOARD_VIEWS[view]?.label ?? "Aplicaciones";
}

function WorkspaceProfileDialog({
  fallbackName,
  onOpenChange,
}: {
  fallbackName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = authClient.useSession();

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mi perfil</DialogTitle>
          <DialogDescription>Datos de tu cuenta. Solo lectura.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 text-sm">
          <div className="grid gap-1">
            <dt className="font-medium">Nombre</dt>
            <dd className="text-muted-foreground">{session?.user.name ?? fallbackName}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium">Correo electrónico</dt>
            <dd className="text-muted-foreground">{session?.user.email ?? "—"}</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
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
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

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
      <div className="flex shrink-0 items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                <IconHelpCircle />
                Ayuda
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <DocsLink page="home">
                <IconBook />
                Documentación
              </DocsLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="max-w-48 truncate text-muted-foreground">
                  {userName}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>Mi perfil</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => router.push("/"),
                    },
                  });
                }}
              >
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {profileOpen && (
            <WorkspaceProfileDialog fallbackName={userName} onOpenChange={setProfileOpen} />
          )}
      </div>
    </header>
  );
}
