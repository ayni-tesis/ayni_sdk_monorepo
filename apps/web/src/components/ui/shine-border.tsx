"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ShineBorder({ borderWidth = 1, duration = 14, shineColor = "#000", className, style, ...props }: React.HTMLAttributes<HTMLDivElement> & { borderWidth?: number; duration?: number; shineColor?: string | string[] }) {
  return <div aria-hidden style={{ "--border-width": `${borderWidth}px`, "--duration": `${duration}s`, backgroundImage: `radial-gradient(transparent, transparent, ${Array.isArray(shineColor) ? shineColor.join(",") : shineColor}, transparent, transparent)`, backgroundSize: "300% 300%", mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", padding: "var(--border-width)", ...style } as React.CSSProperties} className={cn("pointer-events-none absolute inset-0 size-full rounded-[inherit] motion-safe:animate-shine", className)} {...props} />;
}
