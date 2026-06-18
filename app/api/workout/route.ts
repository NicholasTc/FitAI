/**
 * GET  /api/workout             — list the user's manual workout sessions (last 28 days)
 * POST /api/workout             — log a new manual workout session
 * DELETE /api/workout?id=<id>  — delete a session
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

const TYPE_LABELS = ["Strength", "Cardio", "Mixed", "Sport", "Other"] as const;
type TypeLabel = (typeof TYPE_LABELS)[number];

function isValidType(t: string): t is TypeLabel {
  return TYPE_LABELS.includes(t as TypeLabel);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const since = cutoff.toISOString().slice(0, 10);

  const sessions = await db.workoutSession.findMany({
    where: { userId: session.user.id, isManual: true, date: { gte: since } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { date, typeLabel, durationMinutes, rpe } = body as {
    date:            string;
    typeLabel:       string;
    durationMinutes: number;
    rpe:             number;
  };

  // Validate
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(date)) {
    return NextResponse.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!isValidType(typeLabel)) {
    return NextResponse.json({ error: `typeLabel must be one of: ${TYPE_LABELS.join(", ")}` }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 360) {
    return NextResponse.json({ error: "durationMinutes must be 5–360" }, { status: 400 });
  }
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
    return NextResponse.json({ error: "RPE must be an integer 1–10" }, { status: 400 });
  }

  const sessionLoad = rpe * durationMinutes; // Foster (2001) session RPE method

  const record = await db.workoutSession.create({
    data: {
      userId:          session.user.id,
      date,
      typeLabel,
      durationMinutes,
      rpe,
      sessionLoad,
      isManual:        true,
      source:          "MANUAL",
    },
  });

  return NextResponse.json({ session: record }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await db.workoutSession.findFirst({
    where: { id, userId: session.user.id, isManual: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.workoutSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
