"use client";

import { useEffect, useState } from "react";

/** A fixed 1920x1080 canvas scaled to fit any projector resolution. All screen sizes are in px on this canvas. */
export function Stage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070708]">
      <div
        className="absolute top-1/2 left-1/2 h-[1080px] w-[1920px] overflow-hidden"
        style={{
          transform: `translate(-50%, -50%) scale(${scale})`,
          background: "radial-gradient(120% 90% at 50% 40%, #121214 0%, #0b0b0c 55%, #060607 100%)",
          opacity: scale === 0 ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
