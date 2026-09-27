import { createServer, type Server } from "node:http";

import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { captureLandingPage } from "../src/server/capture";

let server: Server;
let pageUrl = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/landing.css") {
      response.writeHead(200, { "Content-Type": "text/css" });
      response.end(".hero { background: rgb(20, 83, 45); color: white; }");
      return;
    }

    if (request.url === "/long") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<main><h1>One page</h1><p>${"Useful conversion copy. ".repeat(100)}</p></main>`);
      return;
    }

    if (request.url === "/short") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<main><p>Too short.</p></main>");
      return;
    }

    if (request.url === "/large") {
      const html = `<main><h1>Large but readable</h1><p>${"Landing page copy ".repeat(80)}</p></main>`;
      response.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(html),
      });
      response.end(html);
      return;
    }

    if (request.url !== "/landing") {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<!doctype html>
      <html><head><title>Ignored title</title><link rel="stylesheet" href="/landing.css"><style>.hero { color: #14532d }</style></head>
      <body>
        <nav><a href="/pricing">View pricing</a></nav>
        <main class="hero">
          <h1 id="headline">Loading</h1>
          <p>Give independent teams a calm way to coordinate launches.</p>
          <ul><li>Keep decisions in one place.</li></ul>
          <form action="https://example.invalid/submit"><button onclick="window.shouldNotRun = true">Start a free trial</button></form>
          <p hidden>This must not be captured.</p>
        </main>
        <iframe src="https://example.invalid"></iframe>
        <script>window.sourceScriptRan = true; document.title = '</title><img src="https://unsafe-preview.invalid/escaped-title">'; document.querySelector('#headline').textContent = 'Launches, without the scramble.';</script>
      </body></html>`);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not listen");
  pageUrl = `http://127.0.0.1:${address.port}/landing`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("captureLandingPage", () => {
  it("captures rendered copy in DOM order and returns a script-disabled local preview", async () => {
    const capture = await captureLandingPage(pageUrl, {
      environment: "development",
      allowPrivateNetwork: true,
      navigationTimeoutMs: 5_000,
      contentTimeoutMs: 5_000,
    });

    expect(capture.blocks.map((block) => block.originalText)).toEqual([
      "View pricing",
      "Launches, without the scramble.",
      "Give independent teams a calm way to coordinate launches.",
      "Keep decisions in one place.",
      "Start a free trial",
    ]);
    expect(capture.blocks.every((block) => block.reference.startsWith(`${capture.version}:`))).toBe(
      true,
    );
    expect(capture.blocks.every((block) => block.location.length > 0)).toBe(true);
    for (const block of capture.blocks) {
      expect(capture.snapshotHtml.split(block.reference).length - 1).toBe(1);
    }
    expect(capture.snapshotHtml).toContain("data-capture-block");
    expect(capture.snapshotHtml).toContain("script-src 'none'");
    expect(capture.snapshotHtml).toContain("background: rgb(20, 83, 45)");
    expect(capture.snapshotHtml).not.toMatch(/<script\b|<iframe\b|<title\b|\son[a-z]+=/i);
    expect(capture.snapshotHtml).not.toContain("unsafe-preview.invalid");
    expect(capture.snapshotHtml).not.toMatch(/<link\b/i);
    expect(capture.snapshotHtml).not.toContain("<form action");
    expect(capture.snapshotHtml).not.toContain('href="/pricing"');

    const previewBrowser = await chromium.launch({ headless: true });
    try {
      const previewPage = await previewBrowser.newPage();
      await previewPage.setContent('<iframe sandbox="allow-same-origin"></iframe>');
      const iframe = previewPage.locator("iframe");
      await iframe.evaluate(
        (element, snapshotHtml) => {
          (element as HTMLIFrameElement).srcdoc = snapshotHtml;
        },
        capture.snapshotHtml,
      );
      const iframeHandle = await iframe.elementHandle();
      const previewFrame = await iframeHandle?.contentFrame();
      expect(previewFrame).not.toBeNull();
      await previewFrame!
        .getByRole("heading", { name: "Launches, without the scramble." })
        .waitFor();
      expect(await previewFrame!.evaluate(() => document.scripts.length)).toBe(0);
    } finally {
      await previewBrowser.close();
    }
  }, 30_000);

  it("returns a bounded unsupported state instead of truncating an oversized page", async () => {
    await expect(
      captureLandingPage(pageUrl.replace("/landing", "/long"), {
        environment: "development",
        allowPrivateNetwork: true,
        maxCopyCharacters: 300,
        navigationTimeoutMs: 5_000,
        contentTimeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  }, 30_000);

  it("rejects a response exceeding the configured document byte limit before previewing it", async () => {
    await expect(
      captureLandingPage(pageUrl.replace("/landing", "/large"), {
        environment: "development",
        allowPrivateNetwork: true,
        maxDocumentBytes: 300,
        navigationTimeoutMs: 5_000,
        contentTimeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  }, 30_000);

  it("returns a clear bounded unreadable state when a page never contains enough visible copy", async () => {
    await expect(
      captureLandingPage(pageUrl.replace("/landing", "/short"), {
        environment: "development",
        allowPrivateNetwork: true,
        navigationTimeoutMs: 5_000,
        contentTimeoutMs: 100,
      }),
    ).rejects.toMatchObject({ kind: "unreadable" });
  }, 30_000);

  it("returns a bounded blocked state for a private URL outside the explicit demo setting", async () => {
    await expect(
      captureLandingPage(pageUrl, { environment: "production" }),
    ).rejects.toMatchObject({ kind: "blocked" });
  });
});
