import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/** Invalidate cached analytics and re-render pages after any data change. */
export function invalidateUserData(userId: string) {
  revalidateTag(`analytics:${userId}`);
  revalidatePath("/", "layout");
}
