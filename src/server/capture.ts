import { randomUUID } from "node:crypto";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { CapturedTextBlock, PageCapture } from "../domain/capture";
import {
  CaptureUrlPolicyError,
  type UrlPolicyOptions,
  validateUrlForCapture,
} from "./url-policy";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const DEFAULT_CONTENT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_COPY_CHARACTERS = 30_000;
const DEFAULT_MIN_COPY_CHARACTERS = 100;
const DEFAULT_MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESOURCE_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_STYLESHEET_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export class CaptureFailureError extends Error {
  constructor(
    public readonly kind: "blocked" | "unreadable" | "unsupported" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "CaptureFailureError";
  }
}

export interface CaptureOptions extends UrlPolicyOptions {
  navigationTimeoutMs?: number;
  contentTimeoutMs?: number;
  maxCopyCharacters?: number;
  minCopyCharacters?: number;
  maxSnapshotBytes?: number;
  maxDocumentBytes?: number;
  maxResourceBytes?: number;
  maxTotalResponseBytes?: number;
}

type BrowserCapture = Pick<PageCapture, "blocks" | "snapshotHtml">;

function countRedirects(request: import("playwright").Request): number {
  let redirects = 0;
  let current = request.redirectedFrom();
  while (current) {
    redirects += 1;
    current = current.redirectedFrom();
  }
  return redirects;
}

function publicCaptureMessage(error: unknown): CaptureFailureError {
  if (error instanceof CaptureFailureError) return error;
  if (error instanceof CaptureUrlPolicyError) {
    return new CaptureFailureError("blocked", error.message);
  }
  if (error instanceof Error && /timeout/i.test(error.message)) {
    return new CaptureFailureError(
      "timeout",
      "The landing page did not become readable before the capture timeout.",
    );
  }
  return new CaptureFailureError(
    "unreadable",
    "The landing page could not be captured as a readable local preview.",
  );
}

async function createBrowserCapture(
  page: Page,
  version: string,
  approvedUrls: string[],
  capturedStylesheets: Array<{ href: string; css: string }>,
): Promise<BrowserCapture> {
  return page.evaluate(
    ({ captureVersion, approved, stylesheets }) => {
      type BlockType = CapturedTextBlock["type"];
      const approvedUrls = new Set(approved);
      const stylesheetsByHref = new Map(stylesheets.map((stylesheet) => [stylesheet.href, stylesheet.css]));
      const semanticSelector =
        "h1,h2,h3,h4,h5,h6,p,li,button,a,label,[role='heading'],[role='button']";
      const excludedTags = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "TEMPLATE",
        "SVG",
        "PATH",
        "OPTION",
      ]);
      const normalise = (value: string) => value.replace(/\s+/g, " ").trim();
      const isVisible = (element: Element) => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.hidden || htmlElement.getAttribute("aria-hidden") === "true") return false;
        if (element.closest("script,style,noscript,template,[hidden],[aria-hidden='true']")) return false;
        const style = window.getComputedStyle(htmlElement);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") !== 0 &&
          htmlElement.getClientRects().length > 0
        );
      };
      const isSemanticBlock = (element: Element) => element.matches(semanticSelector);
      const isLeafText = (element: Element) => {
        if (excludedTags.has(element.tagName) || isSemanticBlock(element)) return false;
        const text = normalise((element as HTMLElement).innerText || "");
        if (!text) return false;
        return !Array.from(element.children).some(
          (child) => normalise((child as HTMLElement).innerText || "").length > 0,
        );
      };
      const blockType = (element: Element): BlockType => {
        const tag = element.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag) || element.getAttribute("role") === "heading") return "heading";
        if (tag === "p") return "paragraph";
        if (tag === "li") return "list-item";
        if (tag === "button" || element.getAttribute("role") === "button") return "button";
        if (tag === "a") return "link";
        return "other";
      };
      const domLocation = (element: Element) => {
        const parts: string[] = [];
        let current: Element | null = element;
        while (current) {
          const siblings = current.parentElement
            ? Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current!.tagName)
            : [current];
          const index = siblings.indexOf(current) + 1;
          parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
          current = current.parentElement;
        }
        return parts.join(" > ");
      };
      const candidates = Array.from(document.body?.querySelectorAll("*") ?? []).filter(
        (element) => isVisible(element) && (isSemanticBlock(element) || isLeafText(element)),
      );
      const blocks: CapturedTextBlock[] = [];

      for (const element of candidates) {
        if (candidates.some((candidate) => candidate !== element && candidate.contains(element))) continue;
        const originalText = normalise((element as HTMLElement).innerText || "");
        if (!originalText) continue;
        const reference = `${captureVersion}:block:${blocks.length + 1}`;
        element.setAttribute("data-capture-block", reference);
        blocks.push({ reference, originalText, location: domLocation(element), type: blockType(element) });
      }

      const snapshot = document.documentElement.cloneNode(true) as HTMLElement;
      for (const element of candidates) element.removeAttribute("data-capture-block");

      snapshot
        .querySelectorAll(
          "script,noscript,iframe,frame,frameset,object,embed,applet,portal,base,meta,title,textarea,xmp,noembed,noframes,plaintext",
        )
        .forEach((element) => element.remove());
      snapshot.querySelectorAll("*").forEach((element) => {
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
        }
      });
      snapshot.querySelectorAll("a").forEach((anchor) => {
        anchor.removeAttribute("href");
        anchor.removeAttribute("target");
        anchor.removeAttribute("download");
        anchor.setAttribute("aria-disabled", "true");
      });
      snapshot.querySelectorAll("form").forEach((form) => {
        form.removeAttribute("action");
        form.removeAttribute("method");
        form.removeAttribute("target");
      });
      snapshot.querySelectorAll("button").forEach((button) => {
        button.setAttribute("type", "button");
        button.removeAttribute("formaction");
      });
      snapshot.querySelectorAll("input,select,textarea,option").forEach((control) => {
        control.setAttribute("disabled", "");
        control.removeAttribute("formaction");
      });

      const safeResource = (raw: string | null, baseUrl = location.href) => {
        if (!raw) return null;
        try {
          const resolved = new URL(raw, baseUrl).href;
          const url = new URL(resolved);
          if ((url.protocol === "http:" || url.protocol === "https:") && approvedUrls.has(resolved)) {
            return resolved;
          }
          if (
            url.protocol === "data:" &&
            /^data:(?:image\/(?:png|jpeg|gif|webp|avif)|font\/[a-z0-9.+-]+);/i.test(raw)
          ) {
            return raw;
          }
        } catch {
          return null;
        }
        return null;
      };
      const rewriteCssUrls = (css: string, baseUrl = location.href) =>
        css
          .replace(/@import\s+(?:url\([^)]*\)|[^;]+);/gi, "")
          .replace(/<\/style/gi, "<\\/style")
          .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, quote, raw) => {
            const permitted = safeResource(raw.trim(), baseUrl);
            return permitted ? `url(${quote}${permitted}${quote})` : "none";
          });
      snapshot.querySelectorAll("link").forEach((link) => {
        const stylesheetHref = safeResource(link.getAttribute("href"));
        const css = stylesheetHref ? stylesheetsByHref.get(stylesheetHref) : undefined;
        if (!stylesheetHref || !css) {
          link.remove();
          return;
        }
        const style = document.createElement("style");
        style.setAttribute("data-capture-stylesheet", "");
        style.textContent = rewriteCssUrls(css, stylesheetHref);
        link.replaceWith(style);
      });
      snapshot.querySelectorAll("[src],[href],[poster],[background]").forEach((element) => {
        for (const attributeName of ["src", "href", "poster", "background"]) {
          if (!element.hasAttribute(attributeName)) continue;
          const permitted = safeResource(element.getAttribute(attributeName));
          if (permitted) element.setAttribute(attributeName, permitted);
          else element.removeAttribute(attributeName);
        }
      });
      snapshot.querySelectorAll("[srcset]").forEach((element) => element.removeAttribute("srcset"));
      snapshot.querySelectorAll("[style]").forEach((element) => {
        element.setAttribute("style", rewriteCssUrls(element.getAttribute("style") ?? ""));
      });
      snapshot.querySelectorAll("style").forEach((style) => {
        style.textContent = rewriteCssUrls(style.textContent ?? "");
      });

      const head = snapshot.querySelector("head") ?? snapshot.insertBefore(document.createElement("head"), snapshot.firstChild);
      const csp = document.createElement("meta");
      csp.setAttribute("http-equiv", "Content-Security-Policy");
      csp.setAttribute(
        "content",
        "default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'; style-src 'unsafe-inline'; img-src data: http: https:; font-src data: http: https:; media-src http: https:",
      );
      head.insertBefore(csp, head.firstChild);

      return {
        blocks,
        snapshotHtml: `<!doctype html>${snapshot.outerHTML}`,
      };
    },
    { captureVersion: version, approved: approvedUrls, stylesheets: capturedStylesheets },
  );
}

async function verifyStaticPreview(
  context: BrowserContext,
  snapshotHtml: string,
  expectedReferences: string[],
  minimumCharacters: number,
): Promise<void> {
  const previewPage = await context.newPage();
  try {
    await previewPage.setContent(snapshotHtml, { waitUntil: "domcontentloaded", timeout: 5_000 });
    const isUsable = await previewPage.evaluate(
      ({ references, minimum }) => {
        const visibleText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
        const previewReferences = Array.from(document.querySelectorAll("[data-capture-block]"))
          .map((element) => element.getAttribute("data-capture-block"))
          .filter((reference): reference is string => reference !== null);
        return (
          visibleText.length >= minimum &&
          previewReferences.length === references.length &&
          references.every(
            (reference) => previewReferences.filter((previewReference) => previewReference === reference).length === 1,
          )
        );
      },
      { references: expectedReferences, minimum: minimumCharacters },
    );

    if (!isUsable) {
      throw new CaptureFailureError(
        "unsupported",
        "The landing page could not be preserved as a readable local preview.",
      );
    }
  } finally {
    await previewPage.close();
  }
}

export async function captureLandingPage(
  candidateUrl: string,
  options: CaptureOptions = {},
): Promise<PageCapture> {
  let browser: Browser | undefined;
  let responseSizeFailure: CaptureFailureError | undefined;

  try {
    const safeUrl = await validateUrlForCapture(candidateUrl, options);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ javaScriptEnabled: true, serviceWorkers: "block" });
    const page = await context.newPage();
    const approvedResources = new Set<string>();
    const stylesheetBodies = new Map<string, string>();
    const stylesheetTasks = new Set<Promise<void>>();
    const documentByteLimit = options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
    const resourceByteLimit = options.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES;
    const totalResponseByteLimit =
      options.maxTotalResponseBytes ?? DEFAULT_MAX_TOTAL_RESPONSE_BYTES;
    let reportedResponseBytes = 0;
    let stylesheetBytes = 0;
    let blockedRequest: CaptureUrlPolicyError | undefined;

    page.on("response", (response) => {
      const request = response.request();
      const contentLength = Number(response.headers()["content-length"] ?? "0");
      if (Number.isFinite(contentLength) && contentLength > 0) {
        reportedResponseBytes += contentLength;
        const isPrimaryDocument = request.isNavigationRequest() && request.frame() === page.mainFrame();
        if (contentLength > resourceByteLimit || (isPrimaryDocument && contentLength > documentByteLimit)) {
          responseSizeFailure = new CaptureFailureError(
            "unsupported",
            "The landing page exceeded the capture response-size limit.",
          );
        } else if (reportedResponseBytes > totalResponseByteLimit) {
          responseSizeFailure = new CaptureFailureError(
            "unsupported",
            "The landing page exceeded the total capture response-size limit.",
          );
        }
        if (responseSizeFailure) {
          void page.close();
          return;
        }
      }

      if (request.resourceType() !== "stylesheet" || response.status() >= 400) return;

      const task = response
        .body()
        .then((body) => {
          if (body.byteLength + stylesheetBytes > DEFAULT_MAX_STYLESHEET_BYTES) {
            responseSizeFailure = new CaptureFailureError(
              "unsupported",
              "The landing page stylesheet data exceeded the capture-size limit.",
            );
            void page.close();
            return;
          }
          stylesheetBytes += body.byteLength;
          const css = body.toString("utf8");
          stylesheetBodies.set(response.url(), css);
          stylesheetBodies.set(response.request().url(), css);
        })
        .catch(() => undefined)
        .finally(() => stylesheetTasks.delete(task));
      stylesheetTasks.add(task);
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        if (request.isNavigationRequest() && request.frame() !== page.mainFrame()) {
          await route.abort("blockedbyclient");
          return;
        }
        if (request.isNavigationRequest() && countRedirects(request) > MAX_REDIRECTS) {
          throw new CaptureUrlPolicyError("The landing page redirected too many times.");
        }
        const permitted = await validateUrlForCapture(request.url(), options);
        approvedResources.add(permitted.href);
        await route.continue();
      } catch (error) {
        if (
          error instanceof CaptureUrlPolicyError &&
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          blockedRequest = error;
        }
        await route.abort("blockedbyclient");
      }
    });
    const response = await page.goto(safeUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS,
    });
    if (responseSizeFailure) throw responseSizeFailure;
    if (blockedRequest) throw blockedRequest;
    if (!response || response.status() >= 400) {
      throw new CaptureFailureError("unreadable", "The landing page returned an unreadable response.");
    }
    const contentType = response.headers()["content-type"] ?? "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      throw new CaptureFailureError("unsupported", "The submitted URL did not return an HTML landing page.");
    }

    const minimum = options.minCopyCharacters ?? DEFAULT_MIN_COPY_CHARACTERS;
    try {
      await page.waitForFunction(
        (minimumCharacters) => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length >= minimumCharacters,
        minimum,
        { timeout: options.contentTimeoutMs ?? DEFAULT_CONTENT_TIMEOUT_MS },
      );
    } catch {
      const visibleCopyLength = await page
        .evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length)
        .catch(() => 0);
      if (visibleCopyLength < minimum) {
        throw new CaptureFailureError(
          "unreadable",
          "The landing page did not contain enough visible marketing copy.",
        );
      }
      throw new CaptureFailureError(
        "timeout",
        "The landing page did not become readable before the capture timeout.",
      );
    }
    if (blockedRequest) throw blockedRequest;

    await Promise.allSettled([...stylesheetTasks]);
    if (responseSizeFailure) throw responseSizeFailure;
    const declaredStylesheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll("link[rel~='stylesheet'][href]"))
        .map((element) => (element as HTMLLinkElement).href)
        .filter(Boolean),
    );
    if (declaredStylesheets.some((href) => !stylesheetBodies.has(href))) {
      throw new CaptureFailureError(
        "unsupported",
        "The landing page stylesheet could not be preserved as a safe local preview.",
      );
    }

    const version = `capture_${randomUUID()}`;
    const captured = await createBrowserCapture(
      page,
      version,
      [...approvedResources],
      [...stylesheetBodies].map(([href, css]) => ({ href, css })),
    );
    const extractedText = captured.blocks.map((block) => block.originalText).join("\n");
    const maximum = options.maxCopyCharacters ?? DEFAULT_MAX_COPY_CHARACTERS;
    const snapshotBytes = Buffer.byteLength(captured.snapshotHtml, "utf8");

    if (extractedText.length < minimum) {
      throw new CaptureFailureError("unreadable", "The landing page did not contain enough visible marketing copy.");
    }
    if (extractedText.length > maximum) {
      throw new CaptureFailureError(
        "unsupported",
        "The landing page contains more visible copy than this one-page audit supports.",
      );
    }
    if (snapshotBytes > (options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES)) {
      throw new CaptureFailureError(
        "unsupported",
        "The captured page is too large to preserve as a safe local preview.",
      );
    }

    await verifyStaticPreview(context, captured.snapshotHtml, captured.blocks.map((block) => block.reference), minimum);

    return {
      version,
      finalUrl: page.url(),
      snapshotHtml: captured.snapshotHtml,
      extractedText,
      blocks: captured.blocks,
    };
  } catch (error) {
    if (responseSizeFailure) throw responseSizeFailure;
    throw publicCaptureMessage(error);
  } finally {
    await browser?.close();
  }
}
