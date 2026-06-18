/**
 * GET  /api/settings  — fetch this user's settings (returns defaults if none saved)
 * PATCH /api/settings — upsert settings for this user
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS, type UserSettings } from "@/types/today";
import { type NextRequest, NextResponse } from "next/server";

function rowToSettings(row: {
  wakeTime: string;
  sleepTargetTime: string;
  deepWorkLabel: string;
  lightWorkLabel: string;
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
}): UserSettings {
  return {
    wakeTime:        row.wakeTime,
    sleepTargetTime: row.sleepTargetTime,
    deepWorkLabel:   row.deepWorkLabel,
    lightWorkLabel:  row.lightWorkLabel,
    age:             row.age,
    sex:             (row.sex as "male" | "female" | null) ?? null,
    heightCm:        row.heightCm,
    weightKg:        row.weightKg,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json(row ? rowToSettings(row) : DEFAULT_SETTINGS);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<UserSettings>;

  // Validate time format "HH:MM"
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (body.wakeTime && !timeRe.test(body.wakeTime)) {
    return NextResponse.json({ error: "Invalid wakeTime format" }, { status: 400 });
  }
  if (body.sleepTargetTime && !timeRe.test(body.sleepTargetTime)) {
    return NextResponse.json({ error: "Invalid sleepTargetTime format" }, { status: 400 });
  }

  // Validate profile fields
  if (body.age !== undefined && body.age !== null && (body.age < 10 || body.age > 99)) {
    return NextResponse.json({ error: "Age must be 10–99" }, { status: 400 });
  }
  if (body.sex !== undefined && body.sex !== null && !["male", "female"].includes(body.sex)) {
    return NextResponse.json({ error: "Sex must be 'male' or 'female'" }, { status: 400 });
  }
  if (body.heightCm !== undefined && body.heightCm !== null && (body.heightCm < 100 || body.heightCm > 250)) {
    return NextResponse.json({ error: "Height must be 100–250 cm" }, { status: 400 });
  }
  if (body.weightKg !== undefined && body.weightKg !== null && (body.weightKg < 20 || body.weightKg > 300)) {
    return NextResponse.json({ error: "Weight must be 20–300 kg" }, { status: 400 });
  }

  const row = await db.userSettings.upsert({
    where: { userId: session.user.id },
    update: {
      ...(body.wakeTime        !== undefined && { wakeTime:        body.wakeTime }),
      ...(body.sleepTargetTime !== undefined && { sleepTargetTime: body.sleepTargetTime }),
      ...(body.deepWorkLabel   !== undefined && { deepWorkLabel:   body.deepWorkLabel.trim() || DEFAULT_SETTINGS.deepWorkLabel }),
      ...(body.lightWorkLabel  !== undefined && { lightWorkLabel:  body.lightWorkLabel.trim() || DEFAULT_SETTINGS.lightWorkLabel }),
      ...(body.age      !== undefined && { age:      body.age }),
      ...(body.sex      !== undefined && { sex:      body.sex }),
      ...(body.heightCm !== undefined && { heightCm: body.heightCm }),
      ...(body.weightKg !== undefined && { weightKg: body.weightKg }),
    },
    create: {
      userId:          session.user.id,
      wakeTime:        body.wakeTime        ?? DEFAULT_SETTINGS.wakeTime,
      sleepTargetTime: body.sleepTargetTime ?? DEFAULT_SETTINGS.sleepTargetTime,
      deepWorkLabel:   body.deepWorkLabel?.trim()  || DEFAULT_SETTINGS.deepWorkLabel,
      lightWorkLabel:  body.lightWorkLabel?.trim() || DEFAULT_SETTINGS.lightWorkLabel,
      age:             body.age      ?? null,
      sex:             body.sex      ?? null,
      heightCm:        body.heightCm ?? null,
      weightKg:        body.weightKg ?? null,
    },
  });

  return NextResponse.json(rowToSettings(row));
}
