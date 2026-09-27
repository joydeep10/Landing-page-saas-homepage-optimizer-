import { describe, expect, it } from "vitest";

import {
  CaptureUrlPolicyError,
  validateUrlForCapture,
} from "../src/server/url-policy";

const publicResolver = async () => ["93.184.216.34"];

describe("validateUrlForCapture", () => {
  it("accepts an HTTP(S) URL whose complete DNS result is public", async () => {
    await expect(
      validateUrlForCapture("https://example.com/pricing", {
        environment: "production",
        resolveHost: publicResolver,
      }),
    ).resolves.toMatchObject({ hostname: "example.com", protocol: "https:" });
  });

  it("rejects non-HTTP(S) schemes and embedded credentials", async () => {
    await expect(
      validateUrlForCapture("file:///etc/passwd", {
        environment: "production",
        resolveHost: publicResolver,
      }),
    ).rejects.toBeInstanceOf(CaptureUrlPolicyError);

    await expect(
      validateUrlForCapture("https://user:pass@example.com", {
        environment: "production",
        resolveHost: publicResolver,
      }),
    ).rejects.toBeInstanceOf(CaptureUrlPolicyError);
  });

  it("rejects a host when any resolved address is private in production", async () => {
    await expect(
      validateUrlForCapture("https://example.com", {
        environment: "production",
        resolveHost: async () => ["93.184.216.34", "10.10.0.8"],
      }),
    ).rejects.toThrow(/not permitted/i);
  });

  it("rejects IPv6 loopback and IPv4-mapped private addresses in production", async () => {
    await expect(
      validateUrlForCapture("http://[::1]", {
        environment: "production",
        resolveHost: async () => ["::1"],
      }),
    ).rejects.toThrow(/not permitted/i);

    await expect(
      validateUrlForCapture("https://example.com", {
        environment: "production",
        resolveHost: async () => ["::ffff:127.0.0.1"],
      }),
    ).rejects.toThrow(/not permitted/i);
  });

  it("allows localhost only with the explicit development-only setting", async () => {
    await expect(
      validateUrlForCapture("http://localhost:3000/demo", {
        environment: "development",
        allowPrivateNetwork: true,
        resolveHost: async () => ["127.0.0.1", "::1"],
      }),
    ).resolves.toMatchObject({ hostname: "localhost" });

    await expect(
      validateUrlForCapture("http://localhost:3000/demo", {
        environment: "production",
        allowPrivateNetwork: true,
        resolveHost: async () => ["127.0.0.1"],
      }),
    ).rejects.toThrow(/not permitted/i);
  });
});
