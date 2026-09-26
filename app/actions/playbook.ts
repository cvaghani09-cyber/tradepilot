"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { checklistAnswersSchema, checklistSchema, playbookSchema, tradingPlanSchema } from "@/lib/validation";
import { addPlaybookExample, createPlaybook, deletePlaybook, removePlaybookExample, updatePlaybook } from "@/services/playbooks";
import { createChecklist, deleteChecklist, deleteChecklistResponse, saveChecklistResponse, updateChecklist } from "@/services/checklists";
import { saveTradingPlan } from "@/services/trading-plan";
import { invalidateUserData } from "./revalidate";

const uuid = z.string().uuid();

export async function savePlaybookAction(id: string | null, input: unknown) {
  return withUser(async (u) => {
    const d = parse(playbookSchema, input);
    const row = id ? await updatePlaybook(u.id, parse(uuid, id), d) : await createPlaybook(u.id, d);
    invalidateUserData(u.id);
    return { id: row.id };
  });
}
export async function deletePlaybookAction(id: string) {
  return withUser(async (u) => {
    await deletePlaybook(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function togglePlaybookExampleAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(z.object({ playbookId: uuid, tradeId: uuid, pinned: z.boolean(), note: z.string().max(500).nullable().optional() }), input);
    if (d.pinned) await addPlaybookExample(u.id, d.playbookId, d.tradeId, d.note);
    else await removePlaybookExample(u.id, d.playbookId, d.tradeId);
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveChecklistAction(id: string | null, input: unknown) {
  return withUser(async (u) => {
    const d = parse(checklistSchema, input);
    const row = id ? await updateChecklist(u.id, parse(uuid, id), d) : await createChecklist(u.id, d);
    invalidateUserData(u.id);
    return { id: row.id };
  });
}
export async function deleteChecklistAction(id: string) {
  return withUser(async (u) => {
    await deleteChecklist(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveChecklistResponseAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(z.object({ tradeId: uuid, checklistId: uuid, answers: checklistAnswersSchema.nullable() }), input);
    const r = d.answers ? await saveChecklistResponse(u.id, d.tradeId, d.checklistId, d.answers) : (await deleteChecklistResponse(u.id, d.tradeId, d.checklistId), null);
    invalidateUserData(u.id);
    return r;
  });
}
export async function saveTradingPlanAction(input: unknown) {
  return withUser(async (u) => {
    await saveTradingPlan(u.id, parse(tradingPlanSchema, input));
    invalidateUserData(u.id);
    return null;
  });
}
