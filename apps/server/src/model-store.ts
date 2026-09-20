import { application, member, model } from "@ayni/db/schema/index";
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

export type ModelDatabase = {
  transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type Model = {
  id: string;
  applicationId: string;
  name: string;
  runtime: "tensorflow_lite";
  createdAt: string;
  updatedAt: string;
};

export type CreateModelResult =
  | { ok: true; model: Model }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type CreateModelInput = {
  applicationId: string;
  userId: string;
  name: string;
  runtime: "tensorflow_lite";
};

export async function createModel(
  database: ModelDatabase,
  { applicationId, userId, name, runtime }: CreateModelInput,
): Promise<CreateModelResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const applicationRows = (await tx
      .select({
        id: application.id,
        organizationId: application.organizationId,
        status: application.status,
      })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1)
      .for("update")) as { id: string; organizationId: string; status: string }[];
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

    const modelRows = (await tx
      .insert(model)
      .values({
        id: crypto.randomUUID(),
        applicationId: foundApplication.id,
        name,
        runtime,
      })
      .returning()) as {
      id: string;
      applicationId: string;
      name: string;
      runtime: string;
      createdAt: Date | string;
      updatedAt: Date | string;
    }[];
    const created = modelRows[0];

    if (!created) throw new Error("Model creation returned no record");

    return {
      ok: true,
      model: {
        id: created.id,
        applicationId: created.applicationId,
        name: created.name,
        runtime: "tensorflow_lite",
        createdAt:
          created.createdAt instanceof Date
            ? created.createdAt.toISOString()
            : String(created.createdAt),
        updatedAt:
          created.updatedAt instanceof Date
            ? created.updatedAt.toISOString()
            : String(created.updatedAt),
      },
    };
  });
}
