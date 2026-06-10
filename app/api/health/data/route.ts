/**
 * Legacy endpoint — kept for backward compatibility.
 * Redirects callers to the new /api/sync route.
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.redirect(new URL("/api/sync", "http://localhost:3000"), {
    status: 308,
  });
}
