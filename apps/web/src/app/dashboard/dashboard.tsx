"use client";

import {
  IconArchive,
  IconArrowLeft,
  IconCirclePlus,
  IconPencil,
  IconRefresh,
} from "@tabler/icons-react";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { httpClient } from "@/lib/http-client";
import "./dashboard.css";

type Application = {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "archived";
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback;
}

function DashboardShell({
  children,
  userName,
  workspaceName,
}: {
  children: React.ReactNode;
  userName: string;
  workspaceName?: string;
}) {
  return (
    <SidebarProvider>
      <AppSidebar workspaceName={workspaceName} />
      <SidebarInset>
        <header className="flex min-h-15 items-center justify-between border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <span className="text-muted-foreground text-sm">Workspace</span>
            <strong className="truncate">{workspaceName ?? "Cargando workspace…"}</strong>
          </div>
          <span className="truncate text-muted-foreground text-sm">{userName}</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Dashboard({ userName }: { userName: string }) {
  const organization = authClient.useActiveOrganization();
  const memberRole = authClient.useActiveMemberRole();
  const dialog = useRef<HTMLDialogElement>(null);
  const archiveDialog = useRef<HTMLDialogElement>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const workspace = organization.data;
  const canManage = memberRole.data?.role === "admin" || memberRole.data?.role === "owner";
  const activeWorkspaceId = workspace?.id;
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadApplications = useCallback(async (organizationId?: string) => {
    if (!organizationId) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
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
      setError(
        errorMessage(loadError, "No pudimos cargar las aplicaciones. Inténtalo nuevamente."),
      );
    } finally {
      if (!controller.signal.aborted && activeWorkspaceIdRef.current === organizationId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setSelected(null);
    setApplications([]);
    void loadApplications(workspace?.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [workspace?.id, loadApplications]);

  async function createApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setSaving(true);
    try {
      const { data } = await httpClient.post<Application>(
        `/organizations/${workspace.id}/applications`,
        { name },
      );
      setApplications((items) => [...items, data]);
      setSelected(data);
      setName("");
      dialog.current?.close();
      toast.success("Aplicación creada.");
    } catch (createError) {
      toast.error(
        errorMessage(createError, "No pudimos crear la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function renameApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await httpClient.patch<Application>(`/applications/${selected.id}`, {
        name,
      });
      setApplications((items) => items.map((item) => (item.id === data.id ? data : item)));
      setSelected(data);
      setName("");
      dialog.current?.close();
      toast.success("Nombre actualizado.");
    } catch (renameError) {
      toast.error(
        errorMessage(renameError, "No pudimos actualizar la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setName("");
    dialog.current?.showModal();
  }
  function openRename() {
    setName(selected?.name ?? "");
    dialog.current?.showModal();
  }

  async function archiveApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setArchiving(true);
    try {
      const { data } = await httpClient.post<Application>(`/applications/${selected.id}/archive`);
      setApplications((items) => items.filter((item) => item.id !== data.id));
      setSelected(data);
      archiveDialog.current?.close();
      toast.success("Aplicación archivada.");
    } catch (archiveError) {
      toast.error(
        errorMessage(archiveError, "No pudimos archivar la aplicación. Inténtalo nuevamente."),
      );
    } finally {
      setArchiving(false);
    }
  }

  async function openApplication(id: string) {
    try {
      const { data } = await httpClient.get<Application>(`/applications/${id}`);
      setSelected(data);
    } catch (detailError) {
      toast.error(
        errorMessage(detailError, "No pudimos cargar la aplicación. Inténtalo nuevamente."),
      );
    }
  }

  if (!workspace && !organization.isPending)
    return (
      <DashboardShell userName={userName}>
        <main className="applications-page">
          <h1>Aplicaciones</h1>
          <p>No tienes un workspace activo.</p>
        </main>
      </DashboardShell>
    );

  return (
    <DashboardShell userName={userName} workspaceName={workspace?.name}>
      <main className="applications-page">
        <header className="applications-header">
          <div>
            <p>{workspace?.name ?? "Cargando workspace…"}</p>
            <h1>{selected ? selected.name : "Aplicaciones"}</h1>
          </div>
          {!selected && canManage && (
            <Button onClick={openCreate}>
              <IconCirclePlus />
              Nueva aplicación
            </Button>
          )}
        </header>
        {selected ? (
          <section className="application-detail" aria-live="polite">
            <Button variant="ghost" onClick={() => setSelected(null)}>
              <IconArrowLeft />
              Aplicaciones
            </Button>
            <div className="detail-heading">
              <div>
                <span>ID de aplicación</span>
                <code>{selected.id}</code>
              </div>
              <span className="application-status">
                {selected.status === "active" ? "Activa" : "Archivada"}
              </span>
            </div>
            {canManage && (
              <Button variant="outline" onClick={openRename}>
                <IconPencil />
                Editar nombre
              </Button>
            )}
            {canManage && selected.status === "active" && (
              <Button variant="outline" onClick={() => archiveDialog.current?.showModal()}>
                <IconArchive />
                Archivar aplicación
              </Button>
            )}
            <div className="application-sections">
              <section>
                <h2>Workflows</h2>
                <p>Aún no hay workflows configurados.</p>
              </section>
              <section>
                <h2>Modelos</h2>
                <p>Aún no hay modelos configurados.</p>
              </section>
              <section>
                <h2>Credenciales SDK</h2>
                <p>Las credenciales no se muestran aquí.</p>
              </section>
              <section>
                <h2>Datasets</h2>
                <p>Aún no hay datasets configurados.</p>
              </section>
              <section>
                <h2>Telemetría</h2>
                <p>La telemetría estará disponible cuando la aplicación la configure.</p>
              </section>
            </div>
          </section>
        ) : (
          <section className="applications-list" aria-live="polite">
            {loading ? (
              <p>Cargando aplicaciones…</p>
            ) : error ? (
              <div className="applications-error">
                <p>{error}</p>
                <Button variant="outline" onClick={() => void loadApplications(workspace?.id)}>
                  <IconRefresh />
                  Reintentar
                </Button>
              </div>
            ) : applications.length === 0 ? (
              <div className="applications-empty">
                <h2>Aún no hay aplicaciones en este workspace.</h2>
                {canManage && <Button onClick={openCreate}>Crear aplicación</Button>}
              </div>
            ) : (
              <ul>
                {applications.map((application) => (
                  <li key={application.id}>
                    <button type="button" onClick={() => void openApplication(application.id)}>
                      <strong>{application.name}</strong>
                      <code>{application.id}</code>
                    </button>
                    <span className="application-status">
                      {application.status === "active" ? "Activa" : "Archivada"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <dialog ref={dialog} className="application-dialog" onClose={() => setName("")}>
          <form onSubmit={selected ? renameApplication : createApplication}>
            <h2>{selected ? "Editar nombre de la aplicación" : "Crear aplicación"}</h2>
            <label htmlFor="application-name">Nombre de la aplicación</label>
            {!selected && <p>Usa un nombre que tu equipo pueda reconocer.</p>}
            <Input
              id="application-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div>
              <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? selected
                    ? "Guardando cambios…"
                    : "Creando aplicación…"
                  : selected
                    ? "Guardar cambios"
                    : "Crear aplicación"}
              </Button>
            </div>
          </form>
        </dialog>
        <dialog ref={archiveDialog} className="application-dialog">
          <form onSubmit={archiveApplication}>
            <h2>¿Archivar &quot;{selected?.name}&quot;?</h2>
            <p>
              La aplicación dejará de sincronizar recursos nuevos. Sus workflows y modelos se
              conservarán.
            </p>
            <div>
              <Button type="button" variant="ghost" onClick={() => archiveDialog.current?.close()}>
                Cancelar
              </Button>
              <Button type="submit" disabled={archiving}>
                {archiving ? "Archivando aplicación…" : "Archivar aplicación"}
              </Button>
            </div>
          </form>
        </dialog>
      </main>
    </DashboardShell>
  );
}
