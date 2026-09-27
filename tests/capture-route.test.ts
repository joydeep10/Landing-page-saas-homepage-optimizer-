import { describe, expect, it } from "vitest";

import { POST } from "../app/api/captures/route";

describe("POST /api/captures", () => {
  it("rejects a request that is not explicitly JSON before it reaches capture", async () => {
    const response = await POST(
      new Request("http://localhost/api/captures", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/content-type.*application\/json/i);
  });

  it("returns a structured 400 instead of starting capture for missing intent", async () => {
    const response = await POST(
      new Request("http://localhost/api/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/audience|action/i);
  });
});
