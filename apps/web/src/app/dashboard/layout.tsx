import { getDashboardUserName } from "@/lib/session-user";
import Dashboard from "./dashboard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userName = await getDashboardUserName();

  return <Dashboard userName={userName}>{children}</Dashboard>;
}
