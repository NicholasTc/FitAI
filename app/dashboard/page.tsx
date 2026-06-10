import AppShell from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.accessToken || session.error) {
    redirect("/");
  }

  const name = session.user?.name ?? "User";
  const initial = name.charAt(0).toUpperCase();

  return <AppShell userName={name} userInitial={initial} />;
}
