import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth/server";
import { ensureOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { previewStoryBucket } from "./preview-story-media";

const origin = "https://localley-next-preview.nkopp.workers.dev";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export class PreviewBackgroundUnavailable extends Error {}
export interface PreviewBackgroundInput {
  type: "cover" | "day" | "summary"; city: string; theme?: string; dayNumber?: number;
  activities?: string[]; preferAI?: boolean; provider?: "flux" | "seedream" | "gemini";
  cacheKey?: string; excludeUrls?: string[]; slotIndex?: number;
}
export function parsePreviewBackgroundInput(value: unknown): PreviewBackgroundInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["type","city","theme","dayNumber","activities","preferAI","provider","cacheKey","excludeUrls","slotIndex"].includes(k))
    || !["cover","day","summary"].includes(String(v.type)) || typeof v.city !== "string" || !v.city.trim() || v.city.length > 200
    || (v.theme !== undefined && (typeof v.theme !== "string" || v.theme.length > 500))
    || (v.dayNumber !== undefined && (!Number.isInteger(v.dayNumber) || Number(v.dayNumber) < 1 || Number(v.dayNumber) > 30))
    || (v.preferAI !== undefined && typeof v.preferAI !== "boolean")
    || (v.provider !== undefined && !["flux","seedream","gemini"].includes(String(v.provider)))
    || (v.cacheKey !== undefined && (typeof v.cacheKey !== "string" || !/^[\w-]{1,200}$/.test(v.cacheKey)))
    || (v.slotIndex !== undefined && (!Number.isInteger(v.slotIndex) || Number(v.slotIndex) < 0 || Number(v.slotIndex) > 31))) return null;
  for (const [key,maxLength] of [["activities",200],["excludeUrls",2048]] as const) {
    const a=v[key]; if (a !== undefined && (!Array.isArray(a) || a.length > 32 || a.some(x=>typeof x!=="string" || x.length>maxLength))) return null;
  }
  return v as unknown as PreviewBackgroundInput;
}
export async function readPreviewBackgroundBody(req: Request): Promise<PreviewBackgroundInput | null> {
  const reader=req.body?.getReader(); if (!reader) return null;
  const chunks: Uint8Array[]=[]; let size=0;
  try { for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length;
    if(size>16384){await reader.cancel();return null;} chunks.push(value); }
    return parsePreviewBackgroundInput(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));
  } catch { return null; } finally { reader.releaseLock(); }
}
export async function previewBackgroundOwner(userId: string): Promise<string> {
  const user=await currentUser();
  if(user?.id!==userId || !user.emailVerified || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) throw new PreviewBackgroundUnavailable("Reserved verified owner required");
  const ids=await ownerIds(userId); if(ids.legacy && ids.fresh)throw new PreviewBackgroundUnavailable("Conflicting owner");
  return ids.legacy ?? ids.fresh ?? await ensureOwnerId(userId);
}
export function backgroundCacheHash(input: PreviewBackgroundInput): string {
  return createHash("sha256").update(JSON.stringify([input.cacheKey ?? randomUUID(),input.type,input.city,input.theme??null,
    input.dayNumber??null,input.activities??[],input.preferAI??true,input.provider??null,input.excludeUrls??[],input.slotIndex??null])).digest("hex");
}
export function previewBackgroundId(url: string): string | null {
  try { const u=new URL(url); const id=u.pathname.match(/^\/api\/images\/story-background\/media\/([^/]+)$/)?.[1];
    return u.origin===origin && !u.username && !u.password && !u.hash && u.search==="?data_candidate=d1" && id && uuid.test(id) ? id : null;
  }catch{return null;}
}
export const previewBackgroundUrl = (id: string) => `${origin}/api/images/story-background/media/${id}?data_candidate=d1`;
interface Row { id:string; ownerId:string; cacheHash:string; objectKey:string; contentType:string; byteSize:number; sha256:string }
function checkRow(row:Row):void {
  if(!uuid.test(row.id) || !/^[0-9a-f]{64}$/.test(row.cacheHash) || !["image/png","image/jpeg"].includes(row.contentType)
    || row.objectKey!==`story-backgrounds/${row.id}.${row.contentType==="image/jpeg"?"jpg":"png"}`
    || !Number.isSafeInteger(row.byteSize) || row.byteSize<500 || row.byteSize>2*1024*1024 || !/^[0-9a-f]{64}$/.test(row.sha256))throw new PreviewBackgroundUnavailable("Malformed cache metadata");
}
export function previewBackgroundMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if(bytes.length<500 || bytes.length>2*1024*1024)return null;
  if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return "image/png";
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "image/jpeg";
  return null; // Includes WebP: never let Satori interpret it as PNG.
}
async function bytesFor(row:Row):Promise<Uint8Array>{
  checkRow(row);const object=await previewStoryBucket().get(row.objectKey);if(!object)throw new PreviewBackgroundUnavailable("Cache object missing");
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.length!==row.byteSize || previewBackgroundMime(bytes)!==row.contentType || createHash("sha256").update(bytes).digest("hex")!==row.sha256)throw new PreviewBackgroundUnavailable("Cache object mismatch");
  return bytes;
}
export async function cachedPreviewBackground(ownerId:string,cacheHash:string):Promise<string|null>{
  const row=await previewAppDataReader().prepare("SELECT * FROM preview_story_backgrounds WHERE ownerId=? AND cacheHash=?").bind(ownerId,cacheHash).first<Row>();
  if(!row)return null;await bytesFor(row);return previewBackgroundUrl(row.id);
}
/** Unique object per write. Ambiguous metadata replies retain the object for reconciliation. */
export async function savePreviewBackground(ownerId:string,cacheHash:string,bytes:Uint8Array):Promise<string>{
  if(!/^[0-9a-f]{64}$/.test(cacheHash)) throw new PreviewBackgroundUnavailable("Invalid cache hash");
  const mime=previewBackgroundMime(bytes);if(!mime)throw new PreviewBackgroundUnavailable("Unsupported image bytes");
  const id=randomUUID(), key=`story-backgrounds/${id}.${mime==="image/jpeg"?"jpg":"png"}`,bucket=previewStoryBucket();let metadataAttempted=false;
  try{const put=await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});if(!put)throw new Error("R2 write unavailable");
    metadataAttempted=true;
    const result=await previewAppDataReader().prepare(`INSERT OR IGNORE INTO preview_story_backgrounds
      (id,ownerId,cacheHash,objectKey,contentType,byteSize,sha256) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM owners WHERE id=?)`)
      .bind(id,ownerId,cacheHash,key,mime,bytes.length,createHash("sha256").update(bytes).digest("hex"),ownerId).run();
    if(result.meta.changes===1)return previewBackgroundUrl(id);
    if(result.meta.changes!==0)throw new Error("Unexpected cache write count");
    const existing=await cachedPreviewBackground(ownerId,cacheHash);if(!existing)throw new Error("Cache owner disappeared");
    await bucket.delete(key);return existing;
  }catch{if(!metadataAttempted){try{await bucket.delete(key);}catch{/* unique unpublished object; cleanup must reconcile */}}
    throw new PreviewBackgroundUnavailable("Preview storage unavailable");}
}
export async function previewBackgroundData(url:string,userId:string):Promise<{bytes:Uint8Array;contentType:string}|null>{
  const id=previewBackgroundId(url);if(!id)return null;
  const owners=await ownerIds(userId);
  const row=await previewAppDataReader().prepare("SELECT * FROM preview_story_backgrounds WHERE id=? AND ownerId IN (?,?)")
    .bind(id,owners.legacy??"",owners.fresh??"").first<Row>();if(!row)return null;
  return {bytes:await bytesFor(row),contentType:row.contentType};
}
export async function deletePreviewBackground(url:string,ownerId:string):Promise<boolean>{
  const id=previewBackgroundId(url);if(!id)return false;
  const row=await previewAppDataReader().prepare("SELECT * FROM preview_story_backgrounds WHERE id=? AND ownerId=?").bind(id,ownerId).first<Row>();if(!row)return false;
  checkRow(row);await previewStoryBucket().delete(row.objectKey);
  await previewAppDataReader().prepare("DELETE FROM preview_story_backgrounds WHERE id=? AND ownerId=?").bind(id,ownerId).run();return true;
}
