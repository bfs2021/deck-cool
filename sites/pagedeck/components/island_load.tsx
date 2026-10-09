"use client";

import { HydrationProbe } from "./hydration_probe.tsx";
import type { ProbeCopy } from "./hydration_probe.tsx";

export default function IslandLoad({ copy }: { copy: ProbeCopy }) {
  return <HydrationProbe probe="load" copy={copy} />;
}
