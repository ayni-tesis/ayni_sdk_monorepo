import { getDashboardUserName } from "@/lib/session-user";
import Dashboard from "./dashboard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const userName = await getDashboardUserName();

  return (
    <div>
      <Dashboard userName={userName} />
      {children}
    </div>
  );
}
