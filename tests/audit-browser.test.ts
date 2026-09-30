import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculateUniversalAudit, UNIVERSAL_AUDIT_QUESTIONS } from "../src/domain/universal-audit";

const rootDirectory = fileURLToPath(new URL("..", import.meta.url));
const runId = "run_11111111-1111-4111-8111-111111111111";
const captureResponse = {
  runId,
  intent: {
    audience: "Independent product teams",
    primaryAction: "Start a free trial",
    trafficSource: "Direct product research",
  },
  capture: {
    version: "capture_immutable",
    finalUrl: "https://example.com",
    extractedText: "Coordinate launches without the scramble. Start a free trial today.",
    snapshotHtml: "<!doctype html><html><body><h1>Static preview</h1></body></html>",
    blockCount: 2,
  },
};
const auditResponse = {
  runId,
  audit: calculateUniversalAudit(
    UNIVERSAL_AUDIT_QUESTIONS.map((question) => ({ id: question.id, score: 3 })),
  ),
  niche: {
    label: "Release coordination software",
    results: [
      {
        id: "niche_1",
        question: "Does the page explain how teams coordinate release work?",
        yesProbability: 0.88,
      },
      {
        id: "niche_2",
        question: "Does the page communicate how release status stays visible to the team?",
        yesProbability: 0.76,
      },
      {
        id: "niche_3",
        question: "Does the page make the free-trial next step clear for release teams?",
        yesProbability: 0.64,
      },
    ],
  },
};

let server: ChildProcess;
let browser: Browser;
let baseUrl = "";

async function unusedPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForApp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local Next server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The local Next server did not start for the browser test.");
}

async function runNext(args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], {
      cwd: rootDirectory,
      env: environment,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next ${args[0]} failed during the browser test.`));
    });
  });
}

beforeAll(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    ALLOW_PRIVATE_CAPTURE: "false",
  };
  await runNext(["build"], environment);
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", String(port)],
    {
      cwd: rootDirectory,
      env: environment,
      stdio: "ignore",
    },
  );
  await waitForApp(baseUrl);
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

describe("capture-to-audit browser flow", () => {
  it("renders universal and generated niche results after a completed capture", async () => {
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    try {
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text());
      });
      page.on("pageerror", (error) => browserErrors.push(error.message));
      await page.route("**/api/captures", async (route) => {
        expect(route.request().method()).toBe("POST");
        await route.fulfill({ json: captureResponse });
      });
      await page.route("**/api/audits", async (route) => {
        expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({ runId });
        await route.fulfill({ json: auditResponse });
      });

      await page.goto(baseUrl);
      await page.getByRole("button", { name: "Use local demo" }).click();
      await page.waitForTimeout(500);
      if (!(await page.locator('input[type="url"]').inputValue()).endsWith("/demo")) {
        throw new Error(`The capture form did not hydrate: ${browserErrors.join(" | ")}`);
      }
      expect(await page.locator('input[type="url"]').inputValue()).toMatch(/\/demo$/);
      expect(await page.getByLabel("Intended audience").inputValue()).toBe(
        "Independent product teams coordinating releases",
      );
      const captureRequest = page.waitForRequest((request) =>
        request.url().endsWith("/api/captures"),
      );
      await page.getByRole("button", { name: "Capture page" }).click();
      await captureRequest;
      await page.getByRole("heading", { name: "Static local preview" }).waitFor();

      const auditRequest = page.waitForRequest((request) => request.url().endsWith("/api/audits"));
      await page.getByRole("button", { name: "Run complete audit" }).click();
      await auditRequest;
      await page.getByRole("heading", { name: "Universal copy audit" }).waitFor();
      await page.getByText("75 / 100").waitFor();
      await page.getByText("Needs Improvement").waitFor();
      expect(await page.locator(".audit-question").count()).toBe(10);
      await page.getByRole("heading", { name: "Generated niche questions" }).waitFor();
      expect(await page.getByText("Release coordination software").count()).toBeGreaterThan(0);
      expect(await page.locator(".niche-question").count()).toBe(3);
      await page.getByText("88% yes probability").waitFor();
    } finally {
      await page.close();
    }
  }, 60_000);
});
