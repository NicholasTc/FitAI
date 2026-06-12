/**
 * POST /api/reflection — save tonight's reflection
 * GET  /api/reflection?date=YYYY-MM-DD — retrieve reflection for a date
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

export type ReflectionAccuracy = "yes" | "somewhat" | "no";
export type ReflectionOutcome = "great" | "good" | "skipped" | "rest";

export interface ReflectionData {
  date: string;
  accuracy: ReflectionAccuracy;
  outcome: ReflectionOutcome;
  note?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<ReflectionData>;

  if (
    !body.date ||
    !["yes", "somewhat", "no"].includes(body.accuracy ?? "") ||
    !["great", "good", "skipped", "rest"].includes(body.outcome ?? "")
  ) {
    return NextResponse.json({ error: "Invalid reflection data" }, { status: 400 });
  }

  const reflection = await db.reflection.upsert({
    where: { userId_date: { userId: session.user.id, date: body.date } },
    create: {
      userId: session.user.id,
      date: body.date,
      accuracy: body.accuracy!,
      outcome: body.outcome!,
      note: body.note ?? null,
    },
    update: {
      accuracy: body.accuracy!,
      outcome: body.outcome!,
      note: body.note ?? null,
    },
  });

  return NextResponse.json(reflection);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toLocaleDateString("en-CA");

  const reflection = await db.reflection.findUnique({
    where: { userId_date: { userId: session.user.id, date } },
  });

  return NextResponse.json(reflection ?? null);
}
