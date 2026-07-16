import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="kids text-7xl font-bold text-brand-primary">404</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-deep">
          This page wandered off on an adventure
        </h1>
        <p className="mt-2 text-slate-mutedText">
          Let&apos;s get you back to the stories.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Go home
        </Link>
      </div>
    </div>
  );
}
