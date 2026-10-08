import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 p-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Flight Routes</h1>
        <p className="mt-1 text-sm text-white/50">
          Live flight-route projection installation · test build
        </p>
      </div>
      <ul className="space-y-3 text-sm">
        <li>
          <Link
            href="/display"
            className="text-amber-300 underline decoration-amber-300/30 underline-offset-4 hover:decoration-amber-300"
          >
            /display
          </Link>
          <span className="text-white/40"> — the projected map</span>
        </li>
      </ul>
      <p className="text-xs leading-relaxed text-white/30">
        Append <code className="text-white/50">?interactive=1</code> to /display
        to enable pan and zoom while developing. The installation runs without a
        controller so the map cannot be dragged out of frame by accident.
      </p>
    </main>
  );
}
