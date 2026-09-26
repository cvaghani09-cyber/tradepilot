import "server-only";
import type { z } from "zod";
import { AppError, ok, toActionError, type ActionResult } from "@/lib/errors";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";

/** Validate input with Zod, mapping issues to field errors. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join(".") || "_";
    if (!fieldErrors[k]) fieldErrors[k] = issue.message;
  }
  const first = Object.values(fieldErrors)[0];
  throw new AppError("VALIDATION", first ? `Please check the form: ${first}` : "Please check the form.", fieldErrors);
}

/**
 * Wrap a server action: authenticate, rate-limit writes per user, run, and
 * convert any failure into a consistent, user-safe error object.
 */
export async function withUser<T>(fn: (user: CurrentUser) => Promise<T>, opts: { limit?: number } = {}): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    const { allowed } = rateLimit(`action:${user.id}`, opts.limit ?? 240, 60_000);
    if (!allowed) throw new AppError("RATE_LIMITED", "You're doing that too quickly. Wait a moment and try again.");
    return ok(await fn(user));
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}
