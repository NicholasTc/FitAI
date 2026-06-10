import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    date?: string;
    energyLevel?: number;
    stressLevel?: number;
    sleepQuality?: number;
    motivation?: number;
  };

  const date =
    body.date ?? new Date().toISOString().slice(0, 10);
  const { energyLevel, stressLevel, sleepQuality, motivation } = body;

  if (
    typeof energyLevel !== "number" ||
    typeof stressLevel !== "number" ||
    typeof sleepQuality !== "number" ||
    typeof motivation !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing or invalid fields. Expected energyLevel, stressLevel, sleepQuality, motivation (numbers 1–10)." },
      { status: 400 },
    );
  }

  const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v)));

  const checkIn = await db.checkIn.upsert({
    where: { userId_date: { userId: session.user.id, date } },
    create: {
      userId: session.user.id,
      date,
      energyLevel: clamp(energyLevel),
      stressLevel: clamp(stressLevel),
      sleepQuality: clamp(sleepQuality),
      motivation: clamp(motivation),
    },
    update: {
      energyLevel: clamp(energyLevel),
      stressLevel: clamp(stressLevel),
      sleepQuality: clamp(sleepQuality),
      motivation: clamp(motivation),
    },
  });

  return NextResponse.json({ ok: true, checkIn });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date =
    request.nextUrl.searchParams.get("date") ??
    new Date().toISOString().slice(0, 10);

  const checkIn = await db.checkIn.findUnique({
    where: { userId_date: { userId: session.user.id, date } },
  });

  return NextResponse.json({ checkIn });
}
