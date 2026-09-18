import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { joinLoginRedirect } from "@/lib/post-auth";

import JoinInvitation from "./join";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect(joinLoginRedirect(token));
  }

  return <JoinInvitation token={token ?? ""} userName={session.user.name} />;
}
