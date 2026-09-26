import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db, schema } from "@/db";
import { verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        // Throttle brute-force attempts per email
        if (!rateLimit(`login:${email}`, 10, 15 * 60_000).allowed) return null;
        const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
