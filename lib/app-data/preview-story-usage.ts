import "server-only";
import { previewAppDataReader } from "./preview-db";

/** Caller supplies server-selected tier limit; HTTP bodies cannot choose it. Imported usage stays immutable. */
export async function incrementPreviewStoryUsage(ownerId:string,amount:number,limit:number,now=new Date()){
  if(!Number.isFinite(now.getTime()) || ![1,2,3].includes(amount) || !Number.isInteger(limit) || limit<0 || limit>200)throw new Error("Invalid story quota");
  const period=now.toISOString().slice(0,7)+"-01",db=previewAppDataReader();
  const batches=await db.prepare("SELECT counts FROM legacy_import_batches LIMIT 2").all<{counts:string}>();
  const total=await db.prepare("SELECT count(*) AS n FROM legacy_usage").first<{n:number}>();
  if(batches.results.length!==1 || !total || JSON.parse(batches.results[0].counts).legacy_usage!==total.n)throw new Error("Incomplete usage import");
  const source=await db.prepare(`SELECT count FROM legacy_usage WHERE ownerId=? AND usageType='ai_images_generated'
    AND periodType='monthly' AND periodStart=? LIMIT 2`).bind(ownerId,period).all<{count:number}>();
  const initial=source.results[0]?.count??0;
  if(source.results.length>1 || !Number.isSafeInteger(initial) || initial<0 || initial>Number.MAX_SAFE_INTEGER-3)throw new Error("Invalid usage baseline");
  await db.prepare(`INSERT OR IGNORE INTO preview_story_usage(ownerId,periodStart,count,baselineCount)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM owners WHERE id=?)`).bind(ownerId,period,initial,initial,ownerId).run();
  const updated=await db.prepare(`UPDATE preview_story_usage SET count=count+? WHERE ownerId=? AND periodStart=?
    AND count<=? AND baselineCount=? AND EXISTS(SELECT 1 FROM owners WHERE id=?)
    AND (SELECT count(*) FROM legacy_usage WHERE ownerId=? AND usageType='ai_images_generated' AND periodType='monthly' AND periodStart=?)<=1
    AND coalesce((SELECT count FROM legacy_usage WHERE ownerId=? AND usageType='ai_images_generated' AND periodType='monthly' AND periodStart=?),0)=baselineCount
    RETURNING count,baselineCount`).bind(amount,ownerId,period,limit-amount,initial,ownerId,ownerId,period,ownerId,period).first<{count:number;baselineCount:number}>();
  const row=updated??await db.prepare("SELECT count,baselineCount FROM preview_story_usage WHERE ownerId=? AND periodStart=?").bind(ownerId,period).first<{count:number;baselineCount:number}>();
  if(!row || row.baselineCount!==initial || !Number.isSafeInteger(row.count) || row.count<initial)throw new Error("Quota unavailable");
  return {allowed:!!updated,currentUsage:row.count,limit,remaining:Math.max(0,limit-row.count)};
}
