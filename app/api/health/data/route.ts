import { auth } from "@/lib/auth";
import { getAllHealthData } from "@/lib/health";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.error) {
    return Response.json(
      {
        error: "Google session expired. Please sign in again.",
        code: session.error,
      },
      { status: 401 },
    );
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  const data = await getAllHealthData(session.accessToken, date);

  return Response.json(data);
}
