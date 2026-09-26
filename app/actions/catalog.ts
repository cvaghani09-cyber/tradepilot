"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { instrumentSchema, sessionSchema, settingsSchema, strategySchema, tagSchema } from "@/lib/validation";
import { createStrategy, deleteStrategy, updateStrategy, createSetup, deleteSetup } from "@/services/strategies";
import { createTag, createTagCategory, deleteTag, deleteTagCategory } from "@/services/tags";
import { upsertSession, deleteSession } from "@/services/sessions";
import { upsertCustomInstrument, deleteCustomInstrument } from "@/services/instruments";
import { updateUserSettings } from "@/services/users";
import { parseMinute } from "@/lib/calculations/time";
import { AppError } from "@/lib/errors";
import { invalidateUserData } from "./revalidate";

const uuid = z.string().uuid();

export async function saveStrategyAction(id: string | null, input: unknown) {
  return withUser(async (u) => {
    const data = parse(strategySchema, input);
    const row = id ? await updateStrategy(u.id, parse(uuid, id), data) : await createStrategy(u.id, data);
    invalidateUserData(u.id);
    return { id: row.id };
  });
}
export async function deleteStrategyAction(id: string) {
  return withUser(async (u) => {
    await deleteStrategy(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function createSetupAction(input: unknown) {
  return withUser(async (u) => {
    const d = parse(z.object({ name: z.string().trim().min(1).max(80), strategyId: uuid.nullable().optional() }), input);
    const row = await createSetup(u.id, d);
    invalidateUserData(u.id);
    return { id: row.id };
  });
}
export async function deleteSetupAction(id: string) {
  return withUser(async (u) => {
    await deleteSetup(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function createTagAction(input: unknown) {
  return withUser(async (u) => {
    const row = await createTag(u.id, parse(tagSchema, input));
    invalidateUserData(u.id);
    return { id: row.id, name: row.name, color: row.color, categoryId: row.categoryId };
  });
}
export async function deleteTagAction(id: string) {
  return withUser(async (u) => {
    await deleteTag(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function createTagCategoryAction(name: string) {
  return withUser(async (u) => {
    const row = await createTagCategory(u.id, parse(z.string().trim().min(1).max(60), name));
    invalidateUserData(u.id);
    return { id: row.id };
  });
}
export async function deleteTagCategoryAction(id: string) {
  return withUser(async (u) => {
    await deleteTagCategory(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveSessionAction(id: string | null, input: unknown) {
  return withUser(async (u) => {
    const d = parse(sessionSchema, input);
    const startMinute = parseMinute(d.start);
    const endMinute = parseMinute(d.end);
    if (startMinute == null || endMinute == null) throw new AppError("VALIDATION", "Use 24-hour HH:MM times.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: d.timezone });
    } catch {
      throw new AppError("VALIDATION", "That time zone isn't recognised.");
    }
    await upsertSession(u.id, id ? parse(uuid, id) : null, { name: d.name, timezone: d.timezone, startMinute, endMinute, color: d.color });
    invalidateUserData(u.id);
    return null;
  });
}
export async function deleteSessionAction(id: string) {
  return withUser(async (u) => {
    await deleteSession(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveInstrumentAction(input: unknown) {
  return withUser(async (u) => {
    await upsertCustomInstrument(u.id, parse(instrumentSchema, input));
    invalidateUserData(u.id);
    return null;
  });
}
export async function deleteInstrumentAction(id: string) {
  return withUser(async (u) => {
    await deleteCustomInstrument(u.id, parse(uuid, id));
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveSettingsAction(input: unknown) {
  return withUser(async (u) => {
    await updateUserSettings(u.id, parse(settingsSchema, input));
    invalidateUserData(u.id);
    return null;
  });
}
export async function saveThemeAction(theme: string) {
  return withUser(async (u) => {
    await updateUserSettings(u.id, { theme: parse(z.enum(["dark", "light"]), theme) });
    return null;
  });
}
export async function saveTradeColumnsAction(columns: string[]) {
  return withUser(async (u) => {
    const cols = parse(z.array(z.string().max(30)).max(40), columns);
    await updateUserSettings(u.id, { preferences: { ...u.preferences, tradeColumns: cols } });
    return null;
  });
}
export async function saveDashboardWidgetsAction(widgets: string[]) {
  return withUser(async (u) => {
    const list = parse(z.array(z.string().max(30)).max(30), widgets);
    await updateUserSettings(u.id, { preferences: { ...u.preferences, dashboardWidgets: list } });
    return null;
  });
}
