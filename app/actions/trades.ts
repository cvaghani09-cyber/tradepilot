"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { bulkSchema, journalPatchSchema, manualTradeSchema } from "@/lib/validation";
import { bulkAddTags, bulkRemoveTags, bulkUpdateTrades, createManualTrade, deleteTrades, updateTradeJournal } from "@/services/trades";
import { invalidateUserData } from "./revalidate";

const uuid = z.string().uuid();

export async function createManualTradeAction(input: unknown) {
  return withUser(async (u) => {
    const id = await createManualTrade(u.id, parse(manualTradeSchema, input));
    invalidateUserData(u.id);
    return { id };
  });
}

export async function updateTradeJournalAction(id: string, patch: unknown) {
  return withUser(async (u) => {
    await updateTradeJournal(u.id, parse(uuid, id), parse(journalPatchSchema, patch));
    invalidateUserData(u.id);
    return null;
  });
}

export async function bulkTagAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(bulkSchema.extend({ tagIds: z.array(uuid).min(1, "Choose at least one tag"), mode: z.enum(["add", "remove"]) }), input);
    const n = d.mode === "add" ? await bulkAddTags(u.id, d.tradeIds, d.tagIds) : await bulkRemoveTags(u.id, d.tradeIds, d.tagIds);
    invalidateUserData(u.id);
    return { updated: n };
  });
}

export async function bulkUpdateAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(
      bulkSchema.extend({
        patch: z
          .object({ strategyId: uuid.nullable(), setupId: uuid.nullable(), reviewed: z.boolean(), marketCondition: z.string().max(120).nullable() })
          .partial(),
      }),
      input,
    );
    const n = await bulkUpdateTrades(u.id, d.tradeIds, d.patch);
    invalidateUserData(u.id);
    return { updated: n };
  });
}

export async function deleteTradesAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(bulkSchema, input);
    const n = await deleteTrades(u.id, d.tradeIds);
    invalidateUserData(u.id);
    return { deleted: n };
  });
}
