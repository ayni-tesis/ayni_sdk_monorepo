"use client";

import {
  IconCpu,
  IconDatabase,
  IconDeviceAnalytics,
  IconGitBranch,
  IconKey,
  IconSettings,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import type { Application } from "../../types";

export type OverviewViewProps = {
  application: Application;
  canManage?: boolean;
};

export function OverviewView({ application, canManage: _canManage }: OverviewViewProps) {
  const sections: Array<{
    title: string;
    description: string;
    icon: typeof IconGitBranch;
    href: Route;
    status: string;
  }> = [
    {
      title: "Workflows",
      description: "Grafos DAG de inferencia on-device",
      icon: IconGitBranch,
      href: `/dashboard/applications/${application.id}/workflows` as Route,
      status: "0 workflows configurados",
    },
    {
      title: "Modelos",
      description: "Modelos TensorFlow Lite para distribución móvil",
      icon: IconCpu,
      href: `/dashboard/applications/${application.id}/models` as Route,
      status: "0 modelos registrados",
    },
    {
      title: "Credenciales SDK",
      description: "Claves de autenticación y sincronización offline",
      icon: IconKey,
      href: `/dashboard/applications/${application.id}/credentials` as Route,
      status: "Gestión de secretos",
    },
    {
      title: "Configuración",
      description: "ID de aplicación, renombrado y archivado",
      icon: IconSettings,
      href: `/dashboard/applications/${application.id}/settings` as Route,
      status: application.status === "active" ? "Activa" : "Archivada",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <Link
            key={section.title}
            href={section.href}
            className="group flex flex-col justify-between rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/50 hover:bg-card/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-base text-foreground transition-colors group-hover:text-primary">
                  {section.title}
                </span>
                <section.icon className="size-5 text-primary" />
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">{section.description}</p>
            </div>
            <div className="pt-3">
              <span className="font-medium text-muted-foreground text-xs">{section.status}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-4">
          <div className="flex items-center gap-2">
            <IconDatabase className="size-5 text-muted-foreground" />
            <h2 className="font-semibold text-base text-foreground">Datasets</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Recolección y etiquetado de muestras desde dispositivos
          </p>
          <p className="pt-1 text-muted-foreground text-sm">Aún no hay datasets configurados.</p>
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-4">
          <div className="flex items-center gap-2">
            <IconDeviceAnalytics className="size-5 text-muted-foreground" />
            <h2 className="font-semibold text-base text-foreground">Telemetría</h2>
          </div>
          <p className="text-muted-foreground text-xs">
            Métricas de rendimiento e inferencia offline
          </p>
          <p className="pt-1 text-muted-foreground text-sm">
            La telemetría estará disponible cuando la aplicación la configure.
          </p>
        </div>
      </div>
    </div>
  );
}
