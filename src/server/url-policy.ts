import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

export class CaptureUrlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureUrlPolicyError";
  }
}

export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface UrlPolicyOptions {
  environment?: "development" | "production" | "test";
  allowPrivateNetwork?: boolean;
  resolveHost?: ResolveHost;
}

export interface SafeCaptureUrl {
  href: string;
  hostname: string;
  protocol: "http:" | "https:";
}

function isForbiddenIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 2) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0)
  );
}

function parseIpv6Segments(address: string): number[] | null {
  const withoutZone = address.split("%")[0].toLowerCase();
  const halves = withoutZone.split("::");
  if (halves.length > 2) return null;

  const toSegments = (part: string): number[] | null => {
    if (!part) return [];
    const pieces = part.split(":");
    const result: number[] = [];
    for (const piece of pieces) {
      if (piece.includes(".")) {
        const octets = piece.split(".").map(Number);
        if (
          octets.length !== 4 ||
          octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
        ) {
          return null;
        }
        result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else if (!/^[0-9a-f]{1,4}$/.test(piece)) {
        return null;
      } else {
        result.push(Number.parseInt(piece, 16));
      }
    }
    return result;
  };

  const left = toSegments(halves[0]);
  const right = toSegments(halves[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  return [...left, ...Array(Math.max(0, missing)).fill(0), ...right];
}

function isForbiddenIpv6(address: string): boolean {
  const segments = parseIpv6Segments(address);
  if (!segments || segments.length !== 8) return true;

  const [first, second] = segments;
  const isUnspecified = segments.every((segment) => segment === 0);
  const isLoopback = segments.slice(0, 7).every((segment) => segment === 0) && segments[7] === 1;
  const isUniqueLocal = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  const isMulticast = (first & 0xff00) === 0xff00;
  const isDocumentation = first === 0x2001 && second === 0x0db8;

  const embedsIpv4 =
    segments.slice(0, 5).every((segment) => segment === 0) &&
    (segments[5] === 0 || segments[5] === 0xffff);
  const embeddedIpv4 = `${segments[6] >> 8}.${segments[6] & 0xff}.${segments[7] >> 8}.${segments[7] & 0xff}`;

  return (
    isUnspecified ||
    isLoopback ||
    isUniqueLocal ||
    isLinkLocal ||
    isMulticast ||
    isDocumentation ||
    (embedsIpv4 && isForbiddenIpv4(embeddedIpv4))
  );
}

function isForbiddenAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isForbiddenIpv4(address);
  if (version === 6) return isForbiddenIpv6(address);
  return true;
}

async function resolveAllAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];

  const resolutions = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = resolutions.flatMap((resolution) =>
    resolution.status === "fulfilled" ? resolution.value : [],
  );

  if (addresses.length === 0) {
    throw new CaptureUrlPolicyError("The submitted host could not be resolved.");
  }

  return [...new Set(addresses)];
}

function allowsPrivateNetwork(options: UrlPolicyOptions): boolean {
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  return environment === "development" && options.allowPrivateNetwork === true;
}

export async function validateUrlForCapture(
  candidate: string,
  options: UrlPolicyOptions = {},
): Promise<SafeCaptureUrl> {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CaptureUrlPolicyError("Enter a valid HTTP(S) landing page URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CaptureUrlPolicyError("Only HTTP(S) landing page URLs are permitted.");
  }

  if (url.username || url.password) {
    throw new CaptureUrlPolicyError("Landing page URLs cannot contain credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const addresses = await (options.resolveHost ?? resolveAllAddresses)(hostname);
  const localHostname = hostname === "localhost" || hostname.endsWith(".localhost");
  const hasForbiddenAddress = addresses.some(isForbiddenAddress);

  if ((localHostname || hasForbiddenAddress) && !allowsPrivateNetwork(options)) {
    throw new CaptureUrlPolicyError(
      "This landing page address is not permitted for capture in this environment.",
    );
  }

  return { href: url.href, hostname, protocol: url.protocol };
}
