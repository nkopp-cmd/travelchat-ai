import "server-only";

export const previewStorySlideBytes = 8 * 1024 * 1024;
export const previewStoryTotalBytes = 32 * 2 * 1024 * 1024;
const maxRequestBytes = previewStoryTotalBytes + 128 * 1024;

/** Keep the existing total upload bound even when Content-Length is missing or false. */
export async function readPreviewStoryForm(req: Request): Promise<FormData> {
  const type = req.headers.get("content-type");
  if (!type?.startsWith("multipart/form-data;")) throw new RangeError("Invalid story upload");
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxRequestBytes)) {
    throw new RangeError("Story upload is too large");
  }
  if (!req.body) throw new RangeError("Invalid story upload");
  let size = 0;
  const body = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      size += value.length;
      if (size > maxRequestBytes) throw new RangeError("Story upload is too large");
      controller.enqueue(value);
    },
  }));
  try {
    const init: RequestInit & { duplex: "half" } = {
      method: "POST", headers: { "Content-Type": type }, body, duplex: "half",
    };
    return await new Request(req.url, init).formData();
  } catch {
    throw new RangeError(size > maxRequestBytes ? "Story upload is too large" : "Invalid story upload");
  }
}
