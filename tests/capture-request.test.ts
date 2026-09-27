import { describe, expect, it } from "vitest";

import { parseCaptureRequest } from "../src/domain/capture-request";

describe("parseCaptureRequest", () => {
  it("accepts a complete page intent and leaves traffic source optional", () => {
    expect(
      parseCaptureRequest({
        url: "https://example.com/pricing",
        audience: "Independent product teams",
        primaryAction: "Start a free trial",
      }),
    ).toEqual({
      url: "https://example.com/pricing",
      audience: "Independent product teams",
      primaryAction: "Start a free trial",
    });
  });

  it("rejects a request without the authoritative audience or primary action", () => {
    expect(() => parseCaptureRequest({ url: "https://example.com" })).toThrow(
      /audience|primary action/i,
    );
  });

  it("rejects a malformed request instead of coercing untrusted values", () => {
    expect(() =>
      parseCaptureRequest({
        url: ["https://example.com"],
        audience: "A",
        primaryAction: 42,
      }),
    ).toThrow();
  });
});
