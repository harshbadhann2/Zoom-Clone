import Link from "next/link";

/** Shown for any URL that doesn't match a page. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-4xl font-bold tracking-tight text-zoom-blue">zoom</p>
      <h1 className="mt-8 text-2xl font-bold text-[#4a4a4a]">Page not found</h1>
      <p className="mt-2 text-sm text-ink-muted">The link may be broken, or the page may have moved.</p>
      <Link href="/" className="btn-primary mt-6 h-10 px-6">
        Back to home
      </Link>
    </main>
  );
}
