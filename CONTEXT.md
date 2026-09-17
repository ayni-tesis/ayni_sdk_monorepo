# Ayni Domain Context

Ayni is an offline-first platform for orchestrating and deploying on-device AI model workflows to Flutter mobile applications.

## Language

**Workspace**:
The tenant boundary that isolates applications, members, SDK credentials, workflows, and datasets. Implemented directly as a Better Auth Organization without a duplicate entity.
_Avoid_: Team, tenant, project, account

**Organization**:
The Better Auth entity backing a Workspace, holding members and permissions.
_Avoid_: Org, tenant

**Application**:
An isolated project owned by a Workspace that defines and deploys DAG workflows, models, and telemetry policies.
_Avoid_: App project, client app

**Administrator**:
A Workspace member holding the owner or admin role with full management permissions over applications and workspace resources.
_Avoid_: Manager, superuser

**Slug**:
A unique URL-safe identifier generated for each Workspace upon creation to satisfy organization constraints.
_Avoid_: Workspace handle, organization code
