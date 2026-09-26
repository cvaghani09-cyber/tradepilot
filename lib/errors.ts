/**
 * Consistent error objects. Services throw AppError with a user-facing message;
 * anything else is logged and replaced with a generic message — raw technical
 * errors are never shown to users.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "IMPORT"
  | "INTERNAL";

export type ActionError = { code: ErrorCode; message: string; fieldErrors?: Record<string, string> };
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "item") => new AppError("NOT_FOUND", `We couldn't find that ${what}. It may have been deleted.`);

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function toActionError(e: unknown): ActionError {
  if (e instanceof AppError) return { code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  // Postgres unique violation
  if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") {
    return { code: "CONFLICT", message: "Something with that name already exists. Choose a different name." };
  }
  const cause = (e as { cause?: { code?: string } })?.cause;
  if (cause?.code === "23505") {
    return { code: "CONFLICT", message: "Something with that name already exists. Choose a different name." };
  }
  console.error("[unexpected error]", e);
  return { code: "INTERNAL", message: "Something went wrong on our side. Please try again — your data has not been changed." };
}
