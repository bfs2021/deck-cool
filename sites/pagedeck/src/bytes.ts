export function formatBytes(count: number): string {
  return count < 1000 ? `${String(count)} B` : `${(count / 1000).toFixed(1)} kB`;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
