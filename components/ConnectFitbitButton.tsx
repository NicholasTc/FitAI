"use client";

import { signIn } from "next-auth/react";

export default function ConnectFitbitButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("fitbit", { callbackUrl: "/dashboard" })}
      className="inline-flex items-center justify-center rounded-full bg-[#4a7df6] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(74,125,246,0.35)] transition hover:-translate-y-0.5 hover:bg-[#3f6fe0]"
    >
      Connect with Fitbit
    </button>
  );
}
