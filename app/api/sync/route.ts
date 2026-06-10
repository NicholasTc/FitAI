import { auth } from "@/lib/auth";
import { computeBaseline } from "@/lib/baseline";
import { loadSnapshots, syncUserSnapshots } from "@/lib/sync";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken || !session.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.error) {
    return Response.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 },
    );
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);

  await syncUserSnapshots(session.user.id, session.accessToken, date);

  const history = await loadSnapshots(session.user.id, date);
  const today = history.find((s) => s.date === date) ?? {
    date,
    sleepMinutes: null,
    sleepEfficiency: null,
    sleepDeepMin: null,
    sleepRemMin: null,
    sleepLightMin: null,
    restingHr: null,
    hrv: null,
    steps: null,
    activeMinutes: null,
  };

  const result = computeBaseline(history, today);

  return Response.json(result);
}
