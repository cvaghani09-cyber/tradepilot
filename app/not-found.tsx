import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div>
        <p className="text-sm font-semibold">Page not found</p>
        <Link href="/dashboard" className="mt-2 inline-block text-[13px] text-primary hover:underline">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
