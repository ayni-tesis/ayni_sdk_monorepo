import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import JoinInvitation from "./join";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="grid min-h-svh place-items-center px-4">
        <div className="flex w-full max-w-md flex-col gap-4">
          <h1 className="font-semibold text-2xl">Invitación al workspace</h1>
          <p role="alert">Este enlace de invitación no es válido.</p>
        </div>
      </main>
    );
  }

  return <JoinInvitation token={token} userName={session.user.name} />;
}
