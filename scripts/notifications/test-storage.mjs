import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'localley-notification-'));
const bin='/usr/lib/postgresql/18/bin', db=path.join(dir,'db');
const cmd=(exe,args)=>execFileSync(exe,args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
const connection=['-h',dir,'-p','5439','-U',os.userInfo().username];
const sql=query=>cmd(`${bin}/psql`,[...connection,'-d','postgres','-v','ON_ERROR_STOP=1','-Atq','-c',query]).trim();
let running=false;
try{
 cmd(`${bin}/initdb`,['-D',db,'-A','trust','--no-locale']);
 cmd(`${bin}/pg_ctl`,['-D',db,'-l',path.join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 5439`,'-w','start']);running=true;
 sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
 GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
 CREATE TABLE public.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clerk_id text UNIQUE NOT NULL);
 INSERT INTO public.users(clerk_id) VALUES ('owner-a'),('owner-b');`);
 cmd(`${bin}/psql`,[...connection,'-d','postgres','-v','ON_ERROR_STOP=1','-f','supabase/migrations/20261001095033_users_first_notifications.sql']);
 const owner=(id,query)=>`SET ROLE authenticated; SET request.jwt.claims='{"sub":"${id}"}'; ${query}`;
 assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN ('notifications','push_subscriptions','notification_preferences') AND relrowsecurity`),'3');
 for(const table of ['notifications','push_subscriptions','notification_preferences'])assert.equal(sql(`SELECT has_table_privilege('anon','public.${table}','SELECT')`),'f');
 sql(owner('owner-a',`INSERT INTO notification_preferences(clerk_user_id,email_enabled) VALUES('owner-a',false);`));
 assert.equal(sql(owner('owner-a',`SELECT email_enabled FROM notification_preferences WHERE clerk_user_id='owner-a'`)).split('\n').at(-1),'f');
 assert.equal(sql(owner('owner-b',`SELECT count(*) FROM notification_preferences`)).split('\n').at(-1),'0');
 for(const query of [`INSERT INTO notification_preferences(clerk_user_id) VALUES('owner-a') ON CONFLICT(clerk_user_id) DO UPDATE SET email_enabled=true`,`UPDATE notification_preferences SET clerk_user_id='owner-b' WHERE clerk_user_id='owner-a'`]){
  let failed=false;try{sql(owner(query.startsWith('UPDATE')?'owner-a':'owner-b',query))}catch{failed=true}assert.ok(failed,'cross-owner insert/reassignment must fail');
 }
 sql(`SET ROLE service_role; INSERT INTO notifications(clerk_user_id,type,title,message) VALUES('owner-a','system','Test','Owned');`);
 assert.equal(sql(owner('owner-b',`SELECT count(*) FROM notifications`)).split('\n').at(-1),'0');
 assert.equal(sql(owner('owner-a',`UPDATE notifications SET read=true WHERE clerk_user_id='owner-a' RETURNING read`)).split('\n').at(-1),'t');
 let altered=false;try{sql(owner('owner-a',`UPDATE notifications SET title='Forged' WHERE clerk_user_id='owner-a'`))}catch{altered=true}assert.ok(altered,'authenticated owners cannot forge server notice content');
 sql(owner('owner-a',`INSERT INTO push_subscriptions(clerk_user_id,endpoint,p256dh,auth) VALUES('owner-a','https://push.example/shared','a','a')`));
 sql(owner('owner-b',`INSERT INTO push_subscriptions(clerk_user_id,endpoint,p256dh,auth) VALUES('owner-b','https://push.example/shared','b','b')`));
 assert.equal(sql(`SELECT count(*) FROM push_subscriptions`),'2');
 assert.equal(sql(owner('owner-b',`SELECT count(*) FROM push_subscriptions WHERE clerk_user_id='owner-a'`)).split('\n').at(-1),'0');
 assert.equal(sql(`SELECT count(*) FROM users`),'2');
 console.log('Notification storage: migration, defaults, RLS, grants, owner insert/update/deny, isolated endpoint ownership passed.');
}finally{if(running)cmd(`${bin}/pg_ctl`,['-D',db,'-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});}
