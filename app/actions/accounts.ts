"use server";
import { z } from "zod";
import { parse, withUser } from "@/lib/actions";
import { accountSchema } from "@/lib/validation";
import { createAccount, deleteAccount, updateAccount } from "@/services/accounts";
import { invalidateUserData } from "./revalidate";

export async function createAccountAction(input: unknown) {
  return withUser(async (u) => {
    const row = await createAccount(u.id, parse(accountSchema, input));
    invalidateUserData(u.id);
    return { id: row.id };
  });
}

export async function updateAccountAction(id: string, input: unknown) {
  return withUser(async (u) => {
    await updateAccount(u.id, parse(z.string().uuid(), id), parse(accountSchema, input));
    invalidateUserData(u.id);
    return null;
  });
}

export async function deleteAccountAction(id: string) {
  return withUser(async (u) => {
    await deleteAccount(u.id, parse(z.string().uuid(), id));
    invalidateUserData(u.id);
    return null;
  });
}
