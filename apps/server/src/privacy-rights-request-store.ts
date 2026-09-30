import {
  type CreatePrivacyRightsRequest,
  privacyRightsRequestStatusSchema,
  privacyRightsRequestTypeSchema,
  type UpdatePrivacyRightsRequest,
} from "@ayni/api/privacy-rights-request";
import {
  applicationPrivacyRightsRequest,
  applicationPrivacyRightsRequestEvent,
} from "@ayni/db/schema/index";
import { and, desc, eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";

export type PrivacyRightsRequest = {
  id: string;
  applicationId: string;
  noticeVersion: number;
  treatmentId: string;
  purpose: string;
  responsibleEntity: string;
  rightsChannel: string;
  type: string;
  contactEmail: string;
  details: string;
  status: string;
  response: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  updatedById: string | null;
};

export type PublicPrivacyRightsRequest = Pick<
  PrivacyRightsRequest,
  "id" | "type" | "status" | "response" | "reason" | "createdAt"
>;

type Row = Record<string, unknown>;
type RequestRow = Omit<PrivacyRightsRequest, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};
type RightsTransaction = {
  select: (fields?: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (...columns: unknown[]) => {
          limit: (count: number) => {
            offset: (count: number) => Promise<Row[]>;
          };
        };
        limit: (count: number) => {
          for: (strength: "update") => Promise<Row[]>;
          then: Promise<Row[]>["then"];
        };
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown> | Record<string, unknown>[]) => {
      returning: () => Promise<Row[]>;
      then: Promise<unknown>["then"];
    };
  };
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => {
        returning: () => Promise<Row[]>;
        then: Promise<unknown>["then"];
      };
    };
  };
};

function toRequest(row: RequestRow): PrivacyRightsRequest {
  return {
    ...row,
    type: privacyRightsRequestTypeSchema.parse(row.type),
    status: privacyRightsRequestStatusSchema.parse(row.status),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    updatedById: row.updatedById ?? null,
  };
}

function event(
  requestId: string,
  action: string,
  actorUserId: string | null,
  nextStatus: string,
  previousStatus: string | null = null,
) {
  return {
    id: crypto.randomUUID(),
    requestId,
    action,
    actorUserId,
    previousStatus,
    nextStatus,
  };
}

export async function createPrivacyRightsRequest(
  database: ApplicationDatabase,
  input: CreatePrivacyRightsRequest & {
    applicationId: string;
    noticeVersion: number;
    purpose: string;
    responsibleEntity: string;
    rightsChannel: string;
  },
): Promise<{ id: string; status: "received"; createdAt: string }> {
  return database.transaction(async (transaction) => {
    const tx = transaction as RightsTransaction;
    const id = crypto.randomUUID();
    const [saved] = (await tx
      .insert(applicationPrivacyRightsRequest)
      .values({
        id,
        applicationId: input.applicationId,
        noticeVersion: input.noticeVersion,
        treatmentId: input.treatmentId,
        purpose: input.purpose,
        responsibleEntity: input.responsibleEntity,
        rightsChannel: input.rightsChannel,
        type: input.type,
        contactEmail: input.contactEmail,
        details: input.details,
        status: "received",
      })
      .returning()) as unknown as RequestRow[];
    if (!saved) throw new Error("Privacy rights request insert returned no record");
    await tx
      .insert(applicationPrivacyRightsRequestEvent)
      .values(event(id, "created", null, "received"));
    return { id, status: "received", createdAt: toRequest(saved).createdAt };
  });
}

export async function getPublicPrivacyRightsRequest(
  database: ApplicationDatabase,
  id: string,
): Promise<PublicPrivacyRightsRequest | undefined> {
  const tx = database as unknown as RightsTransaction;
  const [row] = (await tx
    .select()
    .from(applicationPrivacyRightsRequest)
    .where(eq(applicationPrivacyRightsRequest.id, id))
    .limit(1)) as unknown as RequestRow[];
  if (!row) return;
  const request = toRequest(row);
  await tx
    .insert(applicationPrivacyRightsRequestEvent)
    .values(event(request.id, "viewed", null, request.status));
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    response: request.response,
    reason: request.reason,
    createdAt: request.createdAt,
  };
}

export type ListPrivacyRightsRequestsResult =
  | { ok: true; requests: PrivacyRightsRequest[]; hasMore: boolean }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export async function listPrivacyRightsRequests(
  database: ApplicationDatabase,
  { applicationId, userId, page }: { applicationId: string; userId: string; page: number },
): Promise<ListPrivacyRightsRequestsResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId, allowArchived: true },
    async (transaction) => {
      const tx = transaction as RightsTransaction;
      const rows = (await tx
        .select()
        .from(applicationPrivacyRightsRequest)
        .where(eq(applicationPrivacyRightsRequest.applicationId, applicationId))
        .orderBy(
          desc(applicationPrivacyRightsRequest.createdAt),
          desc(applicationPrivacyRightsRequest.id),
        )
        .limit(26)
        .offset((page - 1) * 25)) as unknown as RequestRow[];
      const hasMore = rows.length > 25;
      const visibleRows = rows.slice(0, 25);
      if (visibleRows.length) {
        await tx
          .insert(applicationPrivacyRightsRequestEvent)
          .values(visibleRows.map((row) => event(row.id, "viewed", userId, row.status)));
      }
      return { requests: visibleRows.map(toRequest), hasMore };
    },
  );
  return result.ok ? { ok: true, ...result.value } : result;
}

export type UpdatePrivacyRightsRequestResult =
  | { ok: true; request: PrivacyRightsRequest }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export async function updatePrivacyRightsRequest(
  database: ApplicationDatabase,
  input: UpdatePrivacyRightsRequest & {
    applicationId: string;
    requestId: string;
    userId: string;
  },
): Promise<UpdatePrivacyRightsRequestResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId: input.applicationId, userId: input.userId, allowArchived: true },
    async (transaction) => {
      const tx = transaction as RightsTransaction;
      const [existing] = (await tx
        .select()
        .from(applicationPrivacyRightsRequest)
        .where(
          and(
            eq(applicationPrivacyRightsRequest.id, input.requestId),
            eq(applicationPrivacyRightsRequest.applicationId, input.applicationId),
          ),
        )
        .limit(1)
        .for("update")) as unknown as RequestRow[];
      if (!existing) return undefined;
      const [saved] = (await tx
        .update(applicationPrivacyRightsRequest)
        .set({
          status: input.status,
          response: input.response,
          reason: input.reason,
          updatedById: input.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applicationPrivacyRightsRequest.id, input.requestId),
            eq(applicationPrivacyRightsRequest.applicationId, input.applicationId),
          ),
        )
        .returning()) as unknown as RequestRow[];
      if (!saved) throw new Error("Privacy rights request update returned no record");
      await tx
        .insert(applicationPrivacyRightsRequestEvent)
        .values(
          event(
            input.requestId,
            "statusChanged",
            input.userId,
            input.status,
            String(existing.status),
          ),
        );
      return toRequest(saved);
    },
  );
  if (result.ok === false) return result;
  return result.value ? { ok: true, request: result.value } : { ok: false, reason: "notFound" };
}
