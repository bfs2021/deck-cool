"use client";

import { HydrationProbe } from "./hydration_probe.tsx";
import type { ProbeCopy } from "./hydration_probe.tsx";

export default function IslandVisible({ copy }: { copy: ProbeCopy }) {
  return <HydrationProbe probe="visible" copy={copy} />;
}
