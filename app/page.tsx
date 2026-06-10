import ConnectGoogleButton from "@/components/ConnectGoogleButton";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();

  if (session?.accessToken && !session.error) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_85%_10%,rgba(190,210,255,0.45),transparent_60%),radial-gradient(60%_60%_at_10%_90%,rgba(200,185,255,0.35),transparent_60%)]" />

      <main className="relative w-full max-w-lg rounded-[22px] border border-[rgba(148,162,218,0.16)] bg-white/90 p-10 text-center shadow-[0_20px_60px_rgba(80,100,180,0.14)] backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4a7df6] to-[#8065e8] text-lg font-bold text-white shadow-[0_4px_16px_rgba(74,125,246,0.42)]">
          F
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9ea8c4]">
          FitAI MVP
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#1b2040]">
          Connect your Google account
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#63708f]">
          Sign in with Google to pull Fitbit health data through the Google
          Health API. Phase 1 focuses on proving the API connection works.
        </p>

        <div className="mt-8 flex justify-center">
          <ConnectGoogleButton />
        </div>

        <div className="mt-8 rounded-2xl bg-[#f4f5fb] p-4 text-left text-xs leading-6 text-[#63708f]">
          <p className="font-semibold text-[#1b2040]">Before connecting</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Enable Google Health API in Google Cloud Console</li>
            <li>Add your email as a test user on the OAuth consent screen</li>
            <li>
              Put <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
