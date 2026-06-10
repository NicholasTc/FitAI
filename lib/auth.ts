import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GOOGLE_HEALTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/googlehealth.profile.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GOOGLE_HEALTH_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in — store tokens from OAuth response.
      if (account) {
        const expiresIn =
          typeof account.expires_in === "number" ? account.expires_in : 3600;

        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt:
            account.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn,
        };
      }

      // Token still valid (with 60s buffer) — return as-is.
      if (
        typeof token.expiresAt === "number" &&
        Date.now() < token.expiresAt * 1000 - 60_000
      ) {
        return token;
      }

      // Token expired — refresh it.
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: String(token.refreshToken ?? ""),
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          }),
        });

        const refreshed = (await res.json()) as {
          access_token?: string;
          expires_in?: number;
          error?: string;
        };

        if (!res.ok || !refreshed.access_token) {
          throw new Error(refreshed.error ?? "Token refresh failed");
        }

        return {
          ...token,
          accessToken: refreshed.access_token,
          expiresAt:
            Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 3600),
          error: undefined,
        };
      } catch {
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
