import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewBackgroundData, previewBackgroundUrl } from "@/lib/app-data/preview-story-background-cache";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isPreviewStoryCandidate(req))return NextResponse.json({error:"Not found"},{status:404});
  const headers={"Cache-Control":"private, no-store","X-Localley-Data-Source":"d1-preview"};
  const {userId}=await auth();if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  try{const {id}=await params;const object=await previewBackgroundData(previewBackgroundUrl(id),userId);
    if(!object)return NextResponse.json({error:"Not found"},{status:404,headers});
    return new Response(Buffer.from(object.bytes),{headers:{...headers,"Content-Type":object.contentType}});
  }catch{return NextResponse.json({error:"Preview media unavailable"},{status:503,headers});}
}
