"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { globalSearch } from "@/services/search";

export async function searchAction(q: string) {
  return withUser((u) => globalSearch(u.id, parse(z.string().max(100), q)), { limit: 600 });
}
