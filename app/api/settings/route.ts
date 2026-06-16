/**
 * GET  /api/settings  — fetch this user's settings (returns defaults if none saved)
 * PATCH /api/settings — upsert settings for this user
 */

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS, type UserSettings } from "@/types/today";
import { type NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.userSettings.findUnique({
    where: { userId: session.user.id },
  });

  const settings: UserSettings = row
    ? {
        wakeTime: row.wakeTime,
        sleepTargetTime: row.sleepTargetTime,
        deepWorkLabel: row.deepWorkLabel,
        lightWorkLabel: row.lightWorkLabel,
      }
    : DEFAULT_SETTINGS;

  return NextResponse.json(settings);
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

  const row = await db.userSettings.upsert({
    where: { userId: session.user.id },
    update: {
      ...(body.wakeTime        !== undefined && { wakeTime:        body.wakeTime }),
      ...(body.sleepTargetTime !== undefined && { sleepTargetTime: body.sleepTargetTime }),
      ...(body.deepWorkLabel   !== undefined && { deepWorkLabel:   body.deepWorkLabel.trim() || DEFAULT_SETTINGS.deepWorkLabel }),
      ...(body.lightWorkLabel  !== undefined && { lightWorkLabel:  body.lightWorkLabel.trim() || DEFAULT_SETTINGS.lightWorkLabel }),
    },
    create: {
      userId:         session.user.id,
      wakeTime:        body.wakeTime        ?? DEFAULT_SETTINGS.wakeTime,
      sleepTargetTime: body.sleepTargetTime ?? DEFAULT_SETTINGS.sleepTargetTime,
      deepWorkLabel:   body.deepWorkLabel?.trim()  || DEFAULT_SETTINGS.deepWorkLabel,
      lightWorkLabel:  body.lightWorkLabel?.trim() || DEFAULT_SETTINGS.lightWorkLabel,
    },
  });

  const settings: UserSettings = {
    wakeTime:        row.wakeTime,
    sleepTargetTime: row.sleepTargetTime,
    deepWorkLabel:   row.deepWorkLabel,
    lightWorkLabel:  row.lightWorkLabel,
  };

  return NextResponse.json(settings);
}
