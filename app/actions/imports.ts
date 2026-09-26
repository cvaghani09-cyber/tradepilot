"use server";
import { parse, withUser } from "@/lib/actions";
import { importConfirmSchema, importPreviewSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { cancelImport, confirmImport, previewImport, MAX_IMPORT_BYTES } from "@/services/imports";
import { invalidateUserData } from "./revalidate";

export async function previewImportAction(form: FormData) {
  return withUser(
    async (u) => {
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a CSV file to import.");
      if (file.size > MAX_IMPORT_BYTES) throw new AppError("IMPORT", "This file is larger than 15 MB. Split it into smaller date ranges.");
      if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) {
        throw new AppError("IMPORT", "Only .csv files can be imported. Export your trade history as CSV from your broker.");
      }
      const meta = parse(importPreviewSchema, JSON.parse(String(form.get("meta") ?? "{}")));
      return previewImport(u.id, { ...meta, csvText: await file.text() });
    },
    { limit: 30 },
  );
}

export async function confirmImportAction(input: unknown) {
  return withUser(
    async (u) => {
      const d = parse(importConfirmSchema, input);
      const r = await confirmImport(u.id, d.jobId, d.strategy);
      invalidateUserData(u.id);
      return r;
    },
    { limit: 30 },
  );
}

export async function cancelImportAction(jobId: string) {
  return withUser(async (u) => {
    await cancelImport(u.id, jobId);
    return null;
  });
}
