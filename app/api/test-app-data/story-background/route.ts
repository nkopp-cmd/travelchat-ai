import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { backgroundCacheHash, previewBackgroundOwner, previewBackgroundMime, savePreviewBackground, deletePreviewBackground } from "@/lib/app-data/preview-story-background-cache";
import { incrementPreviewStoryUsage } from "@/lib/app-data/preview-story-usage";
const headers={"Cache-Control":"private, no-store","X-Localley-Data-Source":"d1-preview"};
/** No-provider fixture proof. Fixed six-credit ceiling; each upload costs three. No caller-selected tier/limit. */
export async function PUT(req:NextRequest){
  if(!isPreviewStoryCandidate(req))return NextResponse.json({error:"Not found"},{status:404});
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  const key=req.nextUrl.searchParams.get("cacheKey");if(!key || !/^[\w-]{1,200}$/.test(key))return NextResponse.json({error:"Invalid key"},{status:400,headers});
  try{const owner=await previewBackgroundOwner(userId);const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:"Missing bytes"},{status:400,headers});
    const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2097152){await reader.cancel();return NextResponse.json({error:"Too large"},{status:413,headers});}chunks.push(r.value);}}finally{reader.releaseLock();}
    const bytes=Buffer.concat(chunks);if(!previewBackgroundMime(bytes))return NextResponse.json({error:"Unsupported image"},{status:400,headers});
    const usage=await incrementPreviewStoryUsage(owner,3,6);if(!usage.allowed)return NextResponse.json({usage},{status:429,headers});
    const image=await savePreviewBackground(owner,backgroundCacheHash({type:"cover",city:"Owned preview",cacheKey:key}),bytes);
    return NextResponse.json({image,usage,fixture:true},{headers});
  }catch{return NextResponse.json({error:"Preview fixture unavailable"},{status:503,headers});}
}
export async function DELETE(req:NextRequest){
  if(!isPreviewStoryCandidate(req))return NextResponse.json({error:"Not found"},{status:404});
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try{const owner=await previewBackgroundOwner(userId);const image=req.nextUrl.searchParams.get("image")??"";
    return NextResponse.json({deleted:await deletePreviewBackground(image,owner)},{headers});
  }catch{return NextResponse.json({error:"Preview fixture cleanup unavailable"},{status:503,headers});}
}
