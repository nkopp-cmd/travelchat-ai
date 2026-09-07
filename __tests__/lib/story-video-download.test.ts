// @vitest-environment node
import { EventEmitter } from "node:events";
import type { LookupAddress } from "node:dns";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

import { lookup } from "node:dns/promises";
import { request } from "node:https";
import {
    downloadStoryVideo, STORY_VIDEO_DOWNLOAD_MAX_BYTES, STORY_VIDEO_DOWNLOAD_TIMEOUT_MS,
} from "@/lib/story-video-download";

const host = "media.example.com";
const url = `https://${host}/output.mp4?token=secret`;
const allowed = [host];
const publicV4 = { address: "93.184.216.34", family: 4 };
const publicV6 = { address: "2606:4700:4700::1111", family: 6 };
const dns = vi.mocked(lookup);
const https = vi.mocked(request);
const fetchMock = vi.fn(() => { throw new Error("fetch must not be used"); });
let req: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let res: EventEmitter & {
    statusCode: number; headers: Record<string, string>; complete: boolean; destroy: ReturnType<typeof vi.fn>;
};
let options: RequestOptions;
let requestedUrl: URL;
let body: Buffer[];
let stall: boolean;
let connect: ReturnType<typeof vi.fn>;

function mp4(brand = "isom") {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(24);
    buffer.write("ftyp", 4);
    buffer.write(brand, 8);
    buffer.write("isommp42", 16);
    return buffer;
}

beforeEach(() => {
    dns.mockResolvedValue([publicV4]);
    vi.stubGlobal("fetch", fetchMock);
    req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    res = Object.assign(new EventEmitter(), {
        statusCode: 200, headers: {}, complete: false, destroy: vi.fn(),
    });
    body = [mp4()];
    stall = false;
    connect = vi.fn();
    // Simulate the connection path consuming request.lookup, rather than only inspecting its presence.
    https.mockImplementation(((target: URL, opts: RequestOptions, callback: (value: typeof res) => void) => {
        requestedUrl = target;
        options = opts;
        req.end.mockImplementation(() => {
            queueMicrotask(() => {
                opts.lookup!(target.hostname, { family: opts.family }, (error, address, family) => {
                    if (error) { req.emit("error", error); return; }
                    connect(address, family);
                    callback(res);
                    if (stall || res.destroy.mock.calls.length) return;
                    for (const chunk of body) res.emit("data", chunk);
                    res.complete = true;
                    res.emit("end");
                    res.emit("close");
                });
            });
        });
        return req;
    }) as typeof request);
});

afterEach(() => {
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe("story video download", () => {
    it.each([publicV4, publicV6])("pins the actual connection to $address and retains TLS hostname", async address => {
        dns.mockResolvedValueOnce([address]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
        const result = await downloadStoryVideo(url, [" MEDIA.EXAMPLE.COM "]);
        expect(result).toEqual({ buffer: mp4(), contentType: "video/mp4" });
        expect(Object.isFrozen(result)).toBe(true);
        expect(connect).toHaveBeenCalledWith(address.address, address.family);
        expect(dns).toHaveBeenCalledExactlyOnceWith(host, { all: true, verbatim: true });
        expect(requestedUrl.hostname).toBe(host);
        expect(options).toMatchObject({ servername: host, rejectUnauthorized: true, agent: false,
            family: address.family, headers: { "Accept-Encoding": "identity" } });
        const cb = vi.fn();
        options.lookup!(host, { all: true }, cb);
        expect(cb).toHaveBeenCalledWith(null, [address]);
        expect(dns).toHaveBeenCalledTimes(1);
    });

    it.each([
        "http://media.example.com/x", "https://media.example.com:444/x", "https://user:pass@media.example.com/x",
        "https://media.example.com/x#", "https://media.example.com.evil.test/x", "https://sub.media.example.com/x",
        "https://media.example.com./x", "https://127.1/x", "https://2130706433/x", "https://[::1]/x",
        "https://m\u00e9dia.example.com/x", "https://xn--mdia-bpa.example.com/x", "https://%6dedia.example.com/x",
        "https://media.example.com\\@evil.test/x", " https://media.example.com/x", "https://media.example.com:/x",
    ])("rejects URL syntax or hosts: %s", async value => {
        await expect(downloadStoryVideo(value, allowed)).rejects.toMatchObject({ code: "invalid_url" });
        expect(dns).not.toHaveBeenCalled();
        expect(https).not.toHaveBeenCalled();
    });

    it.each([[], ["*.example.com"], ["example.com/"], ["xn--mdia-bpa.example.com"], ["m\u00e9dia.example.com"], ["127.0.0.1"]]
        .map(hosts => ({ hosts })))(
        "rejects invalid server allowlists: $hosts", async ({ hosts }) => {
            await expect(downloadStoryVideo(url, hosts)).rejects.toMatchObject({ code: "invalid_url" });
            expect(dns).not.toHaveBeenCalled();
        });

    it("allows explicit port 443", async () => {
        await expect(downloadStoryVideo(`https://${host}:443/x`, allowed)).resolves.toHaveProperty("contentType", "video/mp4");
    });

    it.each([
        "0.1.2.3", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254",
        "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1",
        "198.18.0.1", "198.19.255.255", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255",
        "240.0.0.1", "255.255.255.255", "::", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fdff::1",
        "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "2001:db8::1", "2001:0DB8:0:0:0:0:0:1",
        "::ffff:93.184.216.34", "::ffff:127.0.0.1", "0:0:0:0:0:ffff:5db8:d822", "::93.184.216.34",
        "64:ff9b::5db8:d822", "2002:5db8:d822::1", "2001:0:1234::1", "2001:20::1", "3fff::1",
        "4000::1", "not-an-ip",
    ])("rejects non-public DNS, including mixed answers: %s", async address => {
        const entry = { address, family: address.includes(":") ? 6 : 4 };
        for (const answers of [[entry], [publicV4, entry], [entry, publicV6]]) {
            dns.mockResolvedValueOnce(answers);
            await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "unsafe_address" });
        }
        expect(https).not.toHaveBeenCalled();
    });

    it.each([[], [{ address: publicV4.address, family: 6 }]].map(answers => ({ answers })))("rejects missing or inconsistent DNS: $answers", async ({ answers }) => {
        dns.mockResolvedValueOnce(answers);
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "unsafe_address" });
        expect(https).not.toHaveBeenCalled();
    });

    it.each([301, 302, 303, 307, 308, 206, 404, 500])("rejects HTTP %s without following redirects", async status => {
        res.statusCode = status;
        res.headers.location = "http://127.0.0.1/secret";
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "http_error" });
        expect(https).toHaveBeenCalledTimes(1);
        expect(res.destroy).toHaveBeenCalled();
    });

    it.each(["gzip", "br", "deflate", "identity, gzip"])("rejects encoding %s", async encoding => {
        res.headers["content-encoding"] = encoding;
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "invalid_response" });
    });

    it.each([undefined, "1"])("counts streamed bytes with content-length %s", async length => {
        if (length) res.headers["content-length"] = length;
        body = [mp4(), Buffer.alloc(STORY_VIDEO_DOWNLOAD_MAX_BYTES)];
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "too_large" });
        expect(req.destroy).toHaveBeenCalled();
        expect(res.destroy).toHaveBeenCalled();
    });

    it("rejects oversized declared length before receiving bytes", async () => {
        res.headers["content-length"] = String(STORY_VIDEO_DOWNLOAD_MAX_BYTES + 1);
        stall = true;
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "too_large" });
    });

    it("accepts exactly 32 MiB with an accurate content-length", async () => {
        body = [mp4(), Buffer.alloc(STORY_VIDEO_DOWNLOAD_MAX_BYTES - 24)];
        res.headers["content-length"] = String(STORY_VIDEO_DOWNLOAD_MAX_BYTES);
        const result = await downloadStoryVideo(url, allowed);
        expect(result.buffer.length).toBe(STORY_VIDEO_DOWNLOAD_MAX_BYTES);
    });

    it.each(["-1", "1.5", "hello", "25", "23"])("rejects malformed or mismatched length %s", async length => {
        res.headers["content-length"] = length;
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "invalid_response" });
    });

    it.each(["mp42", "isom", "iso2", "avc1"])("detects %s without trusting MIME", async brand => {
        res.headers["content-type"] = "text/html";
        body = [mp4(brand).subarray(0, 5), mp4(brand).subarray(5)];
        await expect(downloadStoryVideo(url, allowed)).resolves.toHaveProperty("contentType", "video/mp4");
    });

    it.each([0, 1, 8, 15, 17, 28, 4100])("rejects malformed ftyp box size %s", async size => {
        body[0].writeUInt32BE(size);
        res.headers["content-type"] = "video/mp4";
        await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "invalid_mp4" });
    });

    it.each([Buffer.alloc(0), Buffer.from("<html>not video</html>"), mp4("heic"), mp4().subarray(0, 12),
        Buffer.concat([Buffer.from("junk"), mp4()]), Buffer.from("00000018667479f069736f6d0000000069736f6d6d703432", "hex")])(
        "rejects invalid MP4 signatures %# despite MIME", async buffer => {
            body = [buffer];
            res.headers["content-type"] = "video/mp4";
            await expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "invalid_mp4" });
        });

    it("times out DNS and never starts a late request", async () => {
        vi.useFakeTimers();
        let finish!: (answers: LookupAddress[]) => void;
        dns.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const result = expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "timeout" });
        await vi.advanceTimersByTimeAsync(STORY_VIDEO_DOWNLOAD_TIMEOUT_MS);
        await result;
        finish([publicV4]);
        await Promise.resolve();
        expect(https).not.toHaveBeenCalled();
    });

    it("uses the same deadline for DNS and a stalled body", async () => {
        vi.useFakeTimers();
        dns.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve([publicV4]), 10_000)));
        stall = true;
        const result = expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "timeout" });
        await vi.advanceTimersByTimeAsync(14_999);
        expect(req.destroy).not.toHaveBeenCalled();
        res.emit("data", mp4());
        await vi.advanceTimersByTimeAsync(1);
        await result;
        expect(req.destroy).toHaveBeenCalled();
        expect(res.destroy).toHaveBeenCalled();
    });

    it("times out a connection before headers", async () => {
        vi.useFakeTimers();
        https.mockImplementationOnce(() => req as unknown as ReturnType<typeof request>);
        const result = expect(downloadStoryVideo(url, allowed)).rejects.toMatchObject({ code: "timeout" });
        await vi.advanceTimersByTimeAsync(STORY_VIDEO_DOWNLOAD_TIMEOUT_MS);
        await result;
        expect(req.destroy).toHaveBeenCalled();
    });

    it.each(["dns", "request", "socket", "body", "aborted", "close"])("sanitizes %s failures", async stage => {
        const sensitive = new Error(`${url} private body`);
        if (stage === "dns") dns.mockRejectedValueOnce(sensitive);
        if (stage === "request") https.mockImplementationOnce(() => { throw sensitive; });
        stall = true;
        const pending = downloadStoryVideo(url, allowed);
        const assertion = expect(pending).rejects.toMatchObject({ code: "transport_error", message: "Story video download failed: transport_error" });
        await new Promise(resolve => setImmediate(resolve));
        if (stage === "socket") req.emit("error", sensitive);
        if (stage === "body") res.emit("error", sensitive);
        if (stage === "aborted" || stage === "close") res.emit(stage);
        await assertion;
        const error = await pending.catch(error => error);
        expect(error.cause).toBeUndefined();
        expect(String(error)).not.toContain("secret");
    });
});
