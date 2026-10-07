"use client";

import { IconBook, IconChevronDown, IconHelpCircle } from "@tabler/icons-react";
import { type FormEvent, useEffect, useState } from "react";
import { DocsLink } from "@/components/docs-link";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useSignOut } from "@/lib/use-sign-out";
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
  const { data: session, error, isPending, refetch } = authClient.useSession();
  const [name, setName] = useState(session?.user.name ?? fallbackName);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user.name) setName(session.user.name);
  }, [session?.user.name]);

  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (nextName.length < 2 || nextName.length > 100) {
      setNameError("El nombre debe tener entre 2 y 100 caracteres.");
      setNameSuccess(null);
      return;
    }

    setNameError(null);
    setNameSuccess(null);
    setIsSavingName(true);
    try {
      const result = await authClient.updateUser({ name: nextName });
      if (result.error) throw result.error;
      setName(nextName);
      setNameSuccess("Perfil actualizado.");
      void refetch().catch(() => {});
    } catch {
      setName(session?.user.name ?? fallbackName);
      setNameError("No pudimos actualizar tu perfil. Inténtalo nuevamente.");
    } finally {
      setIsSavingName(false);
    }
  }

  async function sendVerificationEmail() {
    if (!session?.user.email) return;
    setVerificationMessage(null);
    setIsSendingVerification(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: `${window.location.origin}/verify-email?verified=1`,
      });
      if (result.error) throw result.error;
      setVerificationMessage(`Enlace de verificación enviado a ${session.user.email}.`);
    } catch {
      setVerificationMessage("No pudimos enviar el enlace. Inténtalo nuevamente.");
    } finally {
      setIsSendingVerification(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setPasswordError("La contraseña nueva debe tener al menos 8 caracteres.");
      setPasswordSuccess(null);
      return;
    }
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsChangingPassword(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        if (
          result.error.code === "INVALID_PASSWORD" ||
          result.error.code === "CREDENTIAL_ACCOUNT_NOT_FOUND"
        ) {
          setPasswordError("No pudimos verificar tu contraseña actual.");
          return;
        }
        if (
          result.error.code === "PASSWORD_TOO_SHORT" ||
          result.error.code === "PASSWORD_TOO_LONG"
        ) {
          setPasswordError("La contraseña nueva no cumple la política vigente del sistema.");
          return;
        }
        throw result.error;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess("Contraseña actualizada.");
    } catch {
      setPasswordError("No pudimos cambiar tu contraseña. Inténtalo nuevamente.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mi perfil</DialogTitle>
          <DialogDescription>Consulta y actualiza los datos de tu cuenta.</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p role="status" className="text-muted-foreground text-sm">
            Cargando perfil...
          </p>
        ) : error ? (
          <div className="grid gap-3 text-sm">
            <p role="alert">No pudimos cargar tu perfil. Inténtalo nuevamente.</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : !session?.user ? (
          <p role="status" className="text-muted-foreground text-sm">
            Inicia sesión para consultar tu perfil.
          </p>
        ) : (
          <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
            <form className="grid gap-3" onSubmit={updateName}>
              <div className="grid gap-2">
                <label htmlFor="profile-name" className="font-medium text-sm">
                  Nombre
                </label>
                <input
                  id="profile-name"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "profile-name-error" : undefined}
                />
                {nameError && (
                  <p id="profile-name-error" role="alert" className="text-destructive text-sm">
                    {nameError}
                  </p>
                )}
                {nameSuccess && (
                  <p role="status" className="text-muted-foreground text-sm">
                    {nameSuccess}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={isSavingName}>
                {isSavingName ? "Guardando cambios..." : "Guardar cambios"}
              </Button>
            </form>

            <section className="grid gap-3 text-sm" aria-labelledby="profile-email-heading">
              <h3 id="profile-email-heading" className="font-medium">
                Correo electrónico
              </h3>
              <p className="text-muted-foreground">{session.user.email}</p>
              <p role="status">
                {session.user.emailVerified
                  ? "Correo verificado"
                  : "Correo pendiente de verificación"}
              </p>
              {!session.user.emailVerified && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSendingVerification}
                  onClick={() => void sendVerificationEmail()}
                >
                  {isSendingVerification ? "Enviando enlace..." : "Enviar enlace de verificación"}
                </Button>
              )}
              {verificationMessage && (
                <p
                  role={verificationMessage.startsWith("No pudimos") ? "alert" : "status"}
                  className="text-muted-foreground"
                >
                  {verificationMessage}
                </p>
              )}
            </section>

            <form className="grid gap-3" onSubmit={changePassword}>
              <h3 className="font-medium text-sm">Cambiar contraseña</h3>
              <div className="grid gap-2">
                <label htmlFor="current-password" className="text-sm">
                  Contraseña actual
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="new-password" className="text-sm">
                  Nueva contraseña
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              {passwordError && (
                <p role="alert" className="text-destructive text-sm">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p role="status" className="text-muted-foreground text-sm">
                  {passwordSuccess}
                </p>
              )}
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? "Cambiando contraseña..." : "Cambiar contraseña"}
              </Button>
            </form>
          </div>
        )}
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
  const [profileOpen, setProfileOpen] = useState(false);
  const { isPending: isSigningOut, signOut } = useSignOut();

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
            <DropdownMenuItem disabled={isSigningOut} onClick={signOut}>
              {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
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
