import DashboardContent from "@/components/DashboardContent";
import SignOutButton from "@/components/SignOutButton";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.accessToken || session.error) {
    redirect("/");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[rgba(148,162,218,0.16)] bg-[rgba(238,240,249,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#9ea8c4]">
              FitAI Dashboard
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
              {session.user?.name ?? "Google User"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-[#ecfaf6] px-3 py-1.5 text-xs font-semibold text-[#009e83] sm:inline">
              Google Health API
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <DashboardContent />
      </main>
    </div>
  );
}
