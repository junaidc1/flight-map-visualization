'use client';

import dynamic from 'next/dynamic';

// deck.gl needs WebGL, so the canvas can never render on the server. Loading it
// through a client-side dynamic import keeps the route itself prerenderable.
const DisplayCanvas = dynamic(() => import('./DisplayCanvas'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#05070d]">
      <p className="text-xs tracking-[0.2em] text-white/25 uppercase">
        Starting display
      </p>
    </div>
  ),
});

export default function DisplayPage() {
  return <DisplayCanvas />;
}
