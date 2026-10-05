import JoinInvitation from "./join";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return <JoinInvitation token={token ?? ""} />;
}
