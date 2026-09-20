import { application, member } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";

export type TransactionExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => {
          for: (strength: "update") => Promise<Record<string, unknown>[]>;
        };
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      returning: () => Promise<Record<string, unknown>[]>;
    };
  };
};

export type ApplicationDatabase = {
  transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type ApplicationActionInput = {
  applicationId: string;
  userId: string;
};

export type ApplicationActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type AuthorizedApplication = {
  id: string;
  organizationId: string;
  name: string;
};

export async function executeApplicationAction<T>(
  database: ApplicationDatabase,
  { applicationId, userId }: ApplicationActionInput,
  action: (tx: TransactionExecutor, application: AuthorizedApplication) => Promise<T>,
): Promise<ApplicationActionResult<T>> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const applicationRows = (await tx
      .select({
        id: application.id,
        organizationId: application.organizationId,
        name: application.name,
        status: application.status,
      })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1)
      .for("update")) as { id: string; organizationId: string; name: string; status: string }[];
    const foundApplication = applicationRows[0];

    if (!foundApplication) return { ok: false, reason: "notFound" };

    const membershipRows = (await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, foundApplication.organizationId)),
      )
      .limit(1)
      .for("update")) as { role: string }[];
    const membership = membershipRows[0];

    if (!membership) return { ok: false, reason: "notFound" };
    if (membership.role !== "admin" && membership.role !== "owner") {
      return { ok: false, reason: "forbidden" };
    }
    if (foundApplication.status !== "active") return { ok: false, reason: "archived" };

    const value = await action(tx, {
      id: foundApplication.id,
      organizationId: foundApplication.organizationId,
      name: foundApplication.name,
    });

    return { ok: true, value };
  });
}
