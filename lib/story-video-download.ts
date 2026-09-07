import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";

export const STORY_VIDEO_DOWNLOAD_TIMEOUT_MS = 15_000;
export const STORY_VIDEO_DOWNLOAD_MAX_BYTES = 32 * 1024 * 1024;

export type StoryVideoDownloadErrorCode =
    | "invalid_url" | "unsafe_address" | "timeout" | "transport_error"
    | "http_error" | "invalid_response" | "too_large" | "invalid_mp4";

export class StoryVideoDownloadError extends Error {
    constructor(public readonly code: StoryVideoDownloadErrorCode) {
        // Never attach provider URLs, response bodies, or underlying transport errors.
        super(`Story video download failed: ${code}`);
        this.name = "StoryVideoDownloadError";
    }
}

const excluded = new BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
    ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
    ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) excluded.addSubnet(address, prefix, "ipv4");

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
// Fail closed for special assignments, Teredo, 6to4, and documentation space.
for (const [address, prefix] of [
    ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) excluded.addSubnet(address, prefix, "ipv6");

function isPublicAddress(address: string, family: number): boolean {
    if (address.includes("%") || isIP(address) !== family) return false;
    if (family === 4) return !excluded.check(address, "ipv4");
    // This also excludes all IPv4-mapped/compatible, NAT64, local, and multicast addresses.
    return family === 6 && globalV6.check(address, "ipv6") && !excluded.check(address, "ipv6");
}

function isDnsHost(host: string): boolean {
    return host.length <= 253 && host.includes(".") && !isIP(host) &&
        host.split(".").every(label =>
            !label.startsWith("xn--") && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

/** Downloads only from an explicit server-configured allowlist. No redirects or MIME trust.
 * The ftyp check is NOT media validation: ffprobe and a bounded decode remain mandatory.
 */
export async function downloadStoryVideo(
    sourceUrl: string,
    allowedHosts: readonly string[],
): Promise<Readonly<{ buffer: Buffer; contentType: "video/mp4" }>> {
    let url: URL;
    try {
        // Check the raw authority too: reject IDN, escapes, credentials, and URL parser normalization.
        const authority = /^https:\/\/([A-Za-z0-9.-]+)(?::443)?(?:[/?]|$)/.exec(sourceUrl);
        const hosts = allowedHosts.map(host => host.trim().toLowerCase());
        if (!authority || sourceUrl.includes("#") || /[\s\\]/.test(sourceUrl) ||
            !hosts.length || hosts.some(host => !isDnsHost(host))) throw new Error();
        url = new URL(sourceUrl);
        if (url.protocol !== "https:" || url.port || url.username || url.password ||
            !isDnsHost(url.hostname) || authority[1].toLowerCase() !== url.hostname ||
            !hosts.includes(url.hostname)) throw new Error();
    } catch {
        throw new StoryVideoDownloadError("invalid_url");
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let req: ClientRequest | undefined;
        let response: IncomingMessage | undefined;
        const chunks: Buffer[] = [];
        const fail = (code: StoryVideoDownloadErrorCode) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            chunks.length = 0;
            response?.destroy();
            req?.destroy();
            reject(new StoryVideoDownloadError(code));
        };
        // One deadline covers DNS, TLS, headers, and the entire response body.
        const timer = setTimeout(() => fail("timeout"), STORY_VIDEO_DOWNLOAD_TIMEOUT_MS);
        void lookup(url.hostname, { all: true, verbatim: true }).then(addresses => {
            if (settled) return;
            if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address, family))) {
                fail("unsafe_address");
                return;
            }
            const { address, family } = addresses[0];
            req = request(url, {
                method: "GET",
                agent: false,
                family,
                servername: url.hostname,
                rejectUnauthorized: true,
                headers: { Accept: "video/mp4", "Accept-Encoding": "identity" },
                // Keep the DNS hostname for Host and certificate checks, but never resolve it again.
                lookup: (_hostname, options, callback) => {
                    if (options.all) callback(null, [{ address, family }]);
                    else callback(null, address, family);
                },
            }, res => {
                response = res;
                res.on("error", () => fail("transport_error"));
                if (settled) { res.destroy(); return; }
                if (res.statusCode !== 200) { fail("http_error"); return; }
                const encoding = res.headers["content-encoding"];
                if (encoding !== undefined && encoding !== "identity") { fail("invalid_response"); return; }
                const length = res.headers["content-length"];
                if (length !== undefined && (typeof length !== "string" || !/^\d+$/.test(length))) {
                    fail("invalid_response"); return;
                }
                const declared = length === undefined ? undefined : Number(length);
                if (declared !== undefined && declared > STORY_VIDEO_DOWNLOAD_MAX_BYTES) { fail("too_large"); return; }
                let size = 0;
                res.on("data", (chunk: Buffer) => {
                    if (settled) return;
                    size += chunk.length;
                    if (size > STORY_VIDEO_DOWNLOAD_MAX_BYTES) { fail("too_large"); return; }
                    chunks.push(chunk);
                });
                res.on("aborted", () => fail("transport_error"));
                res.on("close", () => { if (!res.complete) fail("transport_error"); });
                res.on("end", () => {
                    if (settled) return;
                    if (!res.complete || (declared !== undefined && declared !== size)) { fail("invalid_response"); return; }
                    const buffer = Buffer.concat(chunks, size);
                    const boxSize = buffer.length >= 16 ? buffer.readUInt32BE(0) : 0;
                    // Only a bounded, standard-size leading ftyp box with a known MP4 major brand.
                    if (boxSize < 16 || boxSize > 4096 || boxSize > buffer.length || boxSize % 4 !== 0 ||
                        !buffer.subarray(4, 8).equals(Buffer.from("ftyp")) ||
                        !["mp42", "isom", "iso2", "avc1"].some(brand => buffer.subarray(8, 12).equals(Buffer.from(brand)))) {
                        fail("invalid_mp4"); return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    chunks.length = 0;
                    resolve(Object.freeze({ buffer, contentType: "video/mp4" as const }));
                });
            });
            req.on("error", () => fail("transport_error"));
            req.end();
        }).catch(() => fail("transport_error"));
    });
}
