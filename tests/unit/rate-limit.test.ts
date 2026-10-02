import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimit } from "@/lib/server/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimit());
  afterEach(() => vi.unstubAllEnvs());

  it("never limits under next dev, where one person and the e2e suite share one address", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (let i = 0; i < 25; i++) expect(rateLimit("ip:dev", 10, 60_000, 1_000)).toBe(true);
  });

  it("limits in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (let i = 0; i < 10; i++) expect(rateLimit("ip:prod", 10, 60_000, 1_000)).toBe(true);
    expect(rateLimit("ip:prod", 10, 60_000, 1_000)).toBe(false);
  });

  it("allows up to the limit inside one window and rejects the next call", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimit("ip:a", 20, 60_000, t0 + i)).toBe(true);
    expect(rateLimit("ip:a", 20, 60_000, t0 + 25)).toBe(false);
  });

  it("allows again once the window has elapsed", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) rateLimit("ip:b", 20, 60_000, t0);
    expect(rateLimit("ip:b", 20, 60_000, t0 + 59_999)).toBe(false);
    expect(rateLimit("ip:b", 20, 60_000, t0 + 60_000)).toBe(true);
  });

  it("keeps keys independent", () => {
    const t0 = 5_000;
    for (let i = 0; i < 20; i++) rateLimit("ip:c", 20, 60_000, t0);
    expect(rateLimit("ip:c", 20, 60_000, t0)).toBe(false);
    expect(rateLimit("ip:d", 20, 60_000, t0)).toBe(true);
  });
});
