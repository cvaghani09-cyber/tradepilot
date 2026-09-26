"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { saveDailyReview } from "@/services/calendar";
import { invalidateUserData } from "./revalidate";

const txt = z.string().max(20000).nullable().transform((v) => (v?.trim() ? v : null));

export async function saveDailyReviewAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: txt,
        goals: txt,
        mistakes: txt,
        review: txt,
        rating: z.number().int().min(1).max(10).nullable(),
      }),
      input,
    );
    const { day, ...rest } = d;
    await saveDailyReview(u.id, day, rest);
    invalidateUserData(u.id);
    return null;
  });
}
