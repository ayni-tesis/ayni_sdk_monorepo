"use client";

import { IconGitBranch } from "@tabler/icons-react";
import type { Application } from "../../types";

export type WorkflowsViewProps = {
  application: Application;
  canManage?: boolean;
};

export function WorkflowsView({
  application: _application,
  canManage: _canManage,
}: WorkflowsViewProps) {
  return (
    <section className="space-y-4">
      <div className="application-section-heading flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconGitBranch className="size-5 text-primary" />
          <h2 className="font-semibold text-lg">Workflows</h2>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">Aún no hay workflows configurados.</p>
    </section>
  );
}
