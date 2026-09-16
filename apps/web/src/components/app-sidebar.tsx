"use client";

import { IconApps, IconChartBar, IconChevronDown, IconFolders, IconSettings } from "@tabler/icons-react";
import Link from "next/link";

import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function AppSidebar() {
  return <Sidebar collapsible="icon"><SidebarHeader className="p-3"><Link href="/dashboard" className="flex items-center gap-2 px-2 font-semibold"><span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">A</span><span>Ayni</span></Link><button className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm"><span className="truncate">Laboratorio Andino</span><IconChevronDown className="size-4" /></button></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupLabel>Espacio de trabajo</SidebarGroupLabel><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive tooltip="Aplicaciones"><IconApps /><span>Aplicaciones</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton tooltip="Workflows"><IconFolders /><span>Workflows</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton tooltip="Telemetría"><IconChartBar /><span>Telemetría</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton tooltip="Configuración"><IconSettings /><span>Configuración</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup></SidebarContent><SidebarFooter className="p-3 text-xs text-muted-foreground">Offline-first · SDK Flutter</SidebarFooter></Sidebar>;
}
