import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const bin='/usr/lib/postgresql/18/bin';
const reportSql=readFileSync(new URL('./notification-history-report.sql',import.meta.url),'utf8');
const marker='PRIVATE_FIXTURE_ENDPOINT_AUTH_MESSAGE';
function command(file,args,input){const r=spawnSync(file,args,{input,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});assert.equal(r.status,0,r.stderr?.slice(0,500));return r.stdout;}

// Disposable Unix-socket-only instance. Tests must run through run-heavy.sh.
test('physical history report on real PostgreSQL',async t=>{
 const dir=mkdtempSync(join(process.env.TMPDIR||tmpdir(),'localley-notification-pg-'));
 let started=false;
 try{
  command(join(bin,'initdb'),['-D',join(dir,'data'),'-A','trust','--no-locale','--encoding=UTF8']);
  command(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -h '' -p 55473`,'-w','start']);started=true;
  const sql=(s,db='postgres')=>command(join(bin,'psql'),['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','55473','-d',db],s);
  const fresh=(name,setup='')=>{sql(`CREATE DATABASE ${name};`);if(setup)sql(setup,name);return name;};
  const report=(db,role='')=>{const output=sql(`${role?`SET ROLE ${role};`:''}${reportSql}`,db);assert.ok(!output.includes(marker),'payload/function/default/argument leak');return JSON.parse(output.trim());};
  const table=(r,name)=>r.tables.find(x=>x.table===name);
  await t.test('absent physical tables remain absent with unknown counts',()=>{
   const r=report(fresh('absent'));assert.equal(r.tables.length,3);for(const row of r.tables){assert.equal(row.physical_state,'absent');assert.equal(row.counts,null);}
   assert.equal(r.read_only,'on');assert.equal(r.snapshot,'repeatable read');assert.equal(r.external_writers_audited,false);assert.equal(r.activation_ready,false);assert.equal(r.project_identity_verified,false);
  });
  await t.test('exact owner/consent counts and installed writer metadata preserve rows',()=>{
   const db=fresh('history',`CREATE TABLE users(clerk_id text PRIMARY KEY); INSERT INTO users VALUES ('owner-a');
    CREATE TABLE notifications(clerk_user_id text,title text DEFAULT '${marker}');
    INSERT INTO notifications VALUES ('owner-a','${marker}'),('owner-a','${marker}'),('orphan','${marker}'),(NULL,'${marker}');
    CREATE TABLE notification_preferences(clerk_user_id text,push_enabled boolean,email_enabled boolean);
    INSERT INTO notification_preferences VALUES ('owner-a',true,false),('orphan',false,true),(NULL,NULL,NULL);
    CREATE TABLE push_subscriptions(clerk_user_id text,endpoint text,auth text); INSERT INTO push_subscriptions VALUES('owner-a','${marker}','${marker}');
    CREATE FUNCTION create_notification_preferences() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO notification_preferences VALUES(NEW.clerk_id,true,true); RAISE NOTICE '${marker}'; RETURN NEW; END $$;
    CREATE TRIGGER create_notification_preferences_trigger AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION create_notification_preferences();
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY notify_read ON notifications FOR SELECT USING (title='${marker}');`);
   const before=sql('SELECT row_to_json(t) FROM notification_preferences t ORDER BY clerk_user_id NULLS LAST;',db);
   const r=report(db),n=table(r,'notifications'),p=table(r,'notification_preferences');
   assert.deepEqual(n.counts,{rows:4,distinct_owners:2,missing_owners:1,matched_user_rows:2,unmatched_user_rows:1,push_true:null,push_false:null,push_null:null,email_true:null,email_false:null,email_null:null});
   assert.equal(n.rls_enabled,true);assert.equal(n.policies.length,1);assert.match(n.policies[0].using_hash,/^[a-f0-9]{32}$/);
   assert.equal(p.counts.push_true,1);assert.equal(p.counts.push_false,1);assert.equal(p.counts.push_null,1);assert.equal(p.counts.email_true,1);assert.equal(p.counts.email_false,1);assert.equal(p.counts.email_null,1);
   assert.equal(r.triggers.length,1);assert.equal(r.triggers[0].enabled,'O');assert.equal(r.functions.length,1);assert.match(r.functions[0].definition_hash,/^[a-f0-9]{32}$/);
   assert.equal(sql('SELECT row_to_json(t) FROM notification_preferences t ORDER BY clerk_user_id NULLS LAST;',db),before,'report fired trigger or changed rows');
  });
  await t.test('blank owners stay missing even when source users contain matching blank IDs',()=>{
   const db=fresh('blank_owners',"CREATE TABLE users(clerk_id text); INSERT INTO users VALUES(''),('   '),('owner-a'); CREATE TABLE notifications(clerk_user_id text); INSERT INTO notifications VALUES(''),('   '),(NULL),('owner-a'),('orphan');");
   const n=table(report(db),'notifications');
   assert.equal(n.counts.rows,5);assert.equal(n.counts.missing_owners,3);assert.equal(n.counts.matched_user_rows,1);assert.equal(n.counts.unmatched_user_rows,1);
   assert.equal(n.counts.missing_owners+n.counts.matched_user_rows+n.counts.unmatched_user_rows,n.counts.rows);
  });
  await t.test('inherited rows are counted with an explicit descendant limitation',()=>{
   const db=fresh('inherited',"CREATE TABLE notifications(clerk_user_id text); CREATE TABLE notification_child(extra text) INHERITS(notifications); INSERT INTO notifications VALUES('parent'); INSERT INTO notification_child VALUES('child','private');");
   const r=report(db);assert.equal(table(r,'notifications').counts.rows,2);
   assert.ok(r.limits.some(x=>x.includes('inherited descendants') && x.includes('unaudited')));
  });
  await t.test('missing fields and nonboolean consent never invent owner or consent zeros',()=>{
   const r=report(fresh('missing','CREATE TABLE notifications(id int); INSERT INTO notifications VALUES(1); CREATE TABLE notification_preferences(clerk_user_id text,push_enabled text); INSERT INTO notification_preferences VALUES(\'orphan\',\'true\');'));
   assert.equal(table(r,'notifications').counts.rows,1);assert.equal(table(r,'notifications').counts.distinct_owners,null);assert.equal(table(r,'notification_preferences').counts.matched_user_rows,null);assert.equal(table(r,'notification_preferences').counts.push_true,null);assert.equal(table(r,'notification_preferences').push_boolean_supported,false);
  });
  await t.test('unsupported views are not executed',()=>{
   const r=report(fresh('views',`CREATE FUNCTION danger() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${marker}'; END $$; CREATE VIEW notifications AS SELECT danger() AS id;`));
   assert.equal(table(r,'notifications').physical_state,'unsupported_relation');assert.equal(table(r,'notifications').counts,null);
  });
  await t.test('restricted RLS reports null physical counts rather than filtered zeros',()=>{
   const db=fresh('restricted',"CREATE TABLE notifications(clerk_user_id text); INSERT INTO notifications VALUES('owner-a'); ALTER TABLE notifications ENABLE ROW LEVEL SECURITY; CREATE ROLE localley_report_reader; GRANT SELECT ON notifications TO localley_report_reader;");
   const r=report(db,'localley_report_reader');assert.equal(r.role_bypasses_rls,false);assert.equal(table(r,'notifications').full_count_visibility,false);assert.equal(table(r,'notifications').counts,null);
  });
  await t.test('restricted user lookup cannot turn hidden users into unmatched owners',()=>{
   const db=fresh('user_lookup',"CREATE TABLE users(clerk_id text); INSERT INTO users VALUES('owner-a'); ALTER TABLE users ENABLE ROW LEVEL SECURITY; CREATE TABLE notifications(clerk_user_id text); INSERT INTO notifications VALUES('owner-a'); GRANT SELECT ON ALL TABLES IN SCHEMA public TO localley_report_reader;");
   const r=report(db,'localley_report_reader'),n=table(r,'notifications');assert.equal(n.counts.rows,1);assert.equal(n.users_lookup_supported,false);assert.equal(n.counts.matched_user_rows,null);assert.equal(n.counts.unmatched_user_rows,null);
  });
  await t.test('report transaction refuses a write and leaves data unchanged',()=>{
   const db=fresh('readonly','CREATE TABLE notifications(id int);');
   const mutated=reportSql.replace('ROLLBACK;','INSERT INTO public.notifications VALUES(9); ROLLBACK;');
   const r=spawnSync(join(bin,'psql'),['-X','-qAt','-v','ON_ERROR_STOP=1','-h',dir,'-p','55473','-d',db],{input:mutated,encoding:'utf8',timeout:30000});
   assert.notEqual(r.status,0);assert.match(r.stderr,/read-only transaction/);assert.equal(sql('SELECT count(*) FROM notifications;',db).trim(),'0');
  });
 }finally{
  if(started)command(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','fast','-w','stop']);
  rmSync(dir,{recursive:true,force:true});
 }
});
