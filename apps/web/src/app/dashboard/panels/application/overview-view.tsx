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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Application } from "../../types";

export type OverviewViewProps = {
  application: Application;
  canManage?: boolean;
};

export function OverviewView({ application, canManage: _canManage }: OverviewViewProps) {
  const cards: Array<{
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
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="h-full cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-semibold text-base">{card.title}</CardTitle>
                  <card.icon className="size-5 text-primary" />
                </div>
                <CardDescription className="text-xs">{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="font-medium text-muted-foreground text-xs">{card.status}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <IconDatabase className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Datasets</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Recolección y etiquetado de muestras desde dispositivos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Aún no hay datasets configurados.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <IconDeviceAnalytics className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Telemetría</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Métricas de rendimiento e inferencia offline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              La telemetría estará disponible cuando la aplicación la configure.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
