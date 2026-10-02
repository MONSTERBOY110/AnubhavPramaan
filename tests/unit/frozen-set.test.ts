import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The mapping eval set is frozen: every declaration's SHA-256 is recorded in FROZEN.md. Any change
// to a label after freezing must go through a logged correction (eval/mapping/freeze.py --amend),
// so this test fails the moment a file differs from its recorded hash.

const DIR = "eval/mapping/declarations";
const FROZEN = "eval/mapping/FROZEN.md";

const sha = (buf: Buffer) =>
  createHash("sha256").update(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");

describe.runIf(existsSync(FROZEN))("frozen mapping eval set", () => {
  // describe.runIf still runs this body when skipping, so read only if the file exists.
  const frozen = existsSync(FROZEN) ? readFileSync(FROZEN, "utf8") : "";
  const recorded = new Map(
    [...frozen.matchAll(/^\| (D\d+\.json) \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1]!, m[2]!]),
  );

  it("records every declaration file, and no other", () => {
    const files = readdirSync(DIR)
      .filter((f) => /^D\d+\.json$/.test(f))
      .sort();
    expect([...recorded.keys()].sort()).toEqual(files);
  });

  it("has not changed since it was frozen", () => {
    for (const [file, hash] of recorded) {
      expect(sha(readFileSync(`${DIR}/${file}`)), file).toBe(hash);
    }
  });

  it("matches the recorded set hash", () => {
    const setHash = frozen.match(/Set hash: `([0-9a-f]{64})`/)![1];
    const lines = [...recorded.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, hash]) => `${hash}  ${file}\n`)
      .join("");
    expect(createHash("sha256").update(lines, "utf8").digest("hex")).toBe(setHash);
  });
});
