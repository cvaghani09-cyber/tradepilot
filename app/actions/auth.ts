"use server";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { registerUser } from "@/services/users";
import { registerSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/auth/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { parse } from "@/lib/actions";

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function registerAction(input: unknown): Promise<ActionResult<null>> {
  try {
    if (!rateLimit(`register:${await clientKey()}`, 5, 60 * 60_000).allowed) {
      return { ok: false, error: { code: "RATE_LIMITED", message: "Too many sign-up attempts. Try again in an hour." } };
    }
    const data = parse(registerSchema, input);
    await registerUser(data);
    await signIn("credentials", { email: data.email, password: data.password, redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}

export async function loginAction(input: { email: string; password: string }): Promise<ActionResult<null>> {
  try {
    if (!rateLimit(`login-ip:${await clientKey()}`, 30, 15 * 60_000).allowed) {
      return { ok: false, error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Wait 15 minutes and try again." } };
    }
    await signIn("credentials", { email: String(input.email ?? ""), password: String(input.password ?? ""), redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: { code: "UNAUTHENTICATED", message: "That email and password don't match an account." } };
    }
    return { ok: false, error: toActionError(e) };
  }
}

/** Sign in to the seeded demo workspace (a separate user — never mixed with real data). */
export async function demoLoginAction(): Promise<ActionResult<null>> {
  try {
    const email = process.env.DEMO_USER_EMAIL || "demo@tradepilot.local";
    await signIn("credentials", { email, password: process.env.DEMO_USER_PASSWORD || "demo-password-not-secret", redirect: false });
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: { code: "NOT_FOUND", message: "The demo workspace hasn't been set up. Run `pnpm db:seed` to create it." } };
    }
    return { ok: false, error: toActionError(e) };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
