import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
export const targetId='42726b65-cba8-4266-97f4-eca6a9dc7d9b';
export const marketTargetId='00fa7ad9-3ef8-43ae-849b-fafd8c0b7ac0';
// Explicit, reviewed incidents only. This command must never accept arbitrary venues.
const targets=new Map([
 [targetId,{name:'Daesin-dong Old Town',listing:'ChIJTwlXpoSifDURJOCAoUd4JoM'}],
 [marketTargetId,{name:'Janghanpyeong Antique Market',listing:'ChIJk7CYh6ujfDURBm5z-rXPgbE',location:'0101000020E610000095D4096822C45F401D5A643BDFC74240'}],
]);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const canonical=value=>JSON.stringify(ordered(value));
export const sourceFields=row=>{const x={...row};delete x.photos;return canonical(x);};
export function validateSnapshot(row){
 const target=targets.get(row?.id);
 if(!target||row.name?.en!==target.name||row.google_place_id!==null||!Array.isArray(row.photos)||row.photos.length!==3)throw Error('Unexpected source snapshot');
 for(const photo of row.photos){const u=new URL(photo,'https://www.localley.io');if(u.pathname!=='/api/places/photo'||!u.searchParams.get('name')?.startsWith(`places/${target.listing}/photos/`))throw Error('Unproven photo identity');}
 if(!/^[0-9a-f]{50}$/i.test(row.location||''))throw Error('Unexpected source point');
 if(target.location&&row.location.toUpperCase()!==target.location)throw Error('Incident source point changed');
}
const pgArray=values=>'{'+values.map(x=>'"'+x.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}';
export function repairFilters(row,rollback=false){validateSnapshot(row);return {id:'eq.'+row.id,name:'eq.'+JSON.stringify(row.name),location:'eq.'+row.location,google_place_id:'is.null',photos:'eq.'+pgArray(rollback?[]:row.photos)};}
export async function run(mode,file,env,selectedTarget=targetId){
 if(!['--dry-run','--apply','--rollback'].includes(mode)||!file)throw Error('Use --dry-run|--apply|--rollback PRIVATE_BACKUP.json');
 if(!targets.has(selectedTarget))throw Error('Unreviewed source target');
 const base=env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/spots';if(new URL(base).hostname!=='llehrhqeolfprutcaopi.supabase.co')throw Error('Wrong project');
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const request=async(filters,method='GET',body)=>{const u=new URL(base);u.search=new URLSearchParams({select:'*',...filters});const r=await fetch(u,{method,headers:{...headers,Prefer:'return=representation,handling=strict,max-affected=1'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Source request HTTP '+r.status);return r.json();};
 let before;
 if(mode==='--dry-run'){
  const rows=await request({id:'eq.'+selectedTarget});if(rows.length!==1)throw Error('Source row missing');before=rows[0];validateSnapshot(before);
  fs.writeFileSync(file,JSON.stringify(before,null,2),{mode:0o600,flag:'wx'});
 }else{before=JSON.parse(fs.readFileSync(file,'utf8'));validateSnapshot(before);}
 if(before.id!==selectedTarget)throw Error('Backup belongs to another incident');
 const filters=repairFilters(before,mode==='--rollback');const matched=await request(filters);if(matched.length!==1)throw Error('CAS preflight must match exactly one unchanged row');
 const withoutPhotos=sourceFields;
 if(withoutPhotos(matched[0])!==withoutPhotos(before))throw Error('Other source fields changed; refuse');
 const summary={mode,id:selectedTarget,matched:1,beforePhotos:matched[0].photos.length,backupSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
 if(mode==='--dry-run')return summary;
 const photos=mode==='--rollback'?before.photos:[];
 const result=await request(filters,'PATCH',{photos});if(result.length!==1||withoutPhotos(result[0])!==withoutPhotos(before))throw Error('Post-write row mismatch; reconcile before retry');
 const after=await request({id:'eq.'+selectedTarget});if(after.length!==1||JSON.stringify(after[0].photos)!==JSON.stringify(photos)||withoutPhotos(after[0])!==withoutPhotos(before))throw Error('Readback mismatch; reconcile before retry');
 return {...summary,afterPhotos:photos.length,otherFieldsUnchanged:true};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const env={...dotenv.parse(fs.readFileSync('/home/dev/projects/CyberLink/apps/Localley/.env.local')),...process.env};run(process.argv[2],process.argv[3],env,process.argv[4]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});}
