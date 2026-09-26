"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ErrorState, Separator } from "@/components/ui/misc";
import { demoLoginAction, loginAction, registerAction } from "@/app/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [demoPending, startDemo] = useTransition();

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1 text-[13px] text-muted">Welcome back. Pick up where you left off.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            const r = await loginAction({ email: String(fd.get("email")), password: String(fd.get("password")) });
            if (!r.ok) return setError(r.error.message);
            router.replace("/dashboard");
            router.refresh();
          });
        }}
      >
        {error && <ErrorState title={error} />}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-faint">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={demoPending}
        onClick={() =>
          startDemo(async () => {
            const r = await demoLoginAction();
            if (!r.ok) return setError(r.error.message);
            router.replace("/dashboard");
            router.refresh();
          })
        }
      >
        Explore the demo workspace
      </Button>
      <p className="mt-2 text-center text-xs text-faint">Sample NQ data, clearly labelled and kept separate from real accounts.</p>
      <p className="mt-8 text-center text-[13px] text-muted">
        New to TradePilot?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Create your account</h2>
      <p className="mt-1 text-[13px] text-muted">Import your first account and see your numbers in minutes.</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setFieldErrors({});
          start(async () => {
            const r = await registerAction({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
            if (!r.ok) {
              setFieldErrors(r.error.fieldErrors ?? {});
              return setError(r.error.message);
            }
            router.replace("/dashboard");
            router.refresh();
          });
        }}
      >
        {error && <ErrorState title={error} />}
        <Field label="Name" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-invalid={!!fieldErrors.password} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
