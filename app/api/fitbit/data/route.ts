import { auth } from "@/lib/auth";
import { getAllFitbitData } from "@/lib/fitbit";

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.error) {
    return Response.json(
      { error: "Fitbit session expired. Please sign in again.", code: session.error },
      { status: 401 },
    );
  }

  const data = await getAllFitbitData(session.accessToken);

  return Response.json(data);
}
