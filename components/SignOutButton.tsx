"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-full border border-[rgba(148,162,218,0.28)] bg-white px-4 py-2 text-sm font-medium text-[#63708f] shadow-sm transition hover:border-[rgba(74,125,246,0.24)] hover:text-[#4a7df6]"
    >
      Sign out
    </button>
  );
}
