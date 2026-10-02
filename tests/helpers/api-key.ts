import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every KEY=VALUE line from .env.local then .env, with process.env winning, so live evals see the
 * same LLM provider configuration the server does.
 */
export function envWithFiles(): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {};
  for (const file of [".env", ".env.local"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) merged[m[1]!] = m[2]!.trim().replace(/^"(.*)"$/, "$1");
    }
  }
  return { ...merged, ...process.env };
}
