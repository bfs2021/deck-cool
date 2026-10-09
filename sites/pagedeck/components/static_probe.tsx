import { HydrationProbe } from "./hydration_probe.tsx";
import type { ProbeCopy } from "./hydration_probe.tsx";

export default function StaticProbe({ copy }: { copy: ProbeCopy }) {
  return <HydrationProbe probe="static" copy={copy} />;
}
