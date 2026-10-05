# Read-only notification history report

Production activation remains unproven. NEED545 requests physical source history and installed writer evidence because privileged Data API returns404/PGRST205. Unavailable REST tables do not prove physical absence or zero history.

## Run the report

Open the verified Localley source project [SQL Editor](https://supabase.com/dashboard/project/llehrhqeolfprutcaopi/sql/new). Verify its project selector before running. Paste all of [notification-history-report.sql](../scripts/d1-migration/notification-history-report.sql). This starts a repeatable-read, read-only transaction with5second statement and1second lock timeouts, returns one JSON report and rolls back. It creates no function, table, trigger or notification. Store the report privately; no row payload, push endpoint/key, column default, policy expression or function/trigger body is returned.

With authorized direct SQL access, run the same file using `psql -X -v ON_ERROR_STOP=1 -f scripts/d1-migration/notification-history-report.sql`. Keep connection credentials outside command arguments and logs. Do not run the old notification schema to obtain this report.

## Evidence and limits

The report distinguishes absent physical relations, supported tables and unsupported views/foreign relations. It returns column metadata/RLS/policy hashes, exact row counts, distinct/missing owners and exact clerk-ID matches to source users where those columns exist. Supported push/email boolean columns report true/false/null counts. Missing or unsupported fields return null counts. RLS-restricted table counts are null; restricted source-user lookup cannot invent unmatched owners. The report records the current SQL role and bypass mode. Relevant installed routines and attached triggers retain names, enabled state, security mode and definition hashes without bodies or arguments.

The fixed project ref is an expectation, not database identity proof. Stored booleans do not prove historical consent; source user matches do not establish Better Auth ownership. Text matching does not exhaust dynamic SQL, cron or external writers. Those require the existing writer audit, private authorized definition review and Nils's report/access. A timeout, permission error or incomplete report cannot close NEED545. Do not activate dormant producers or external delivery from this report.

Compatibility uses longstanding PostgreSQL catalog, read-only transaction and XML-query functions; local PostgreSQL tests do not prove the source version, installed XML support or privileges. References: [Supabase table verification](https://supabase.com/docs/guides/database/tables), [PostgreSQL transaction modes](https://www.postgresql.org/docs/current/sql-set-transaction.html), [PostgreSQL XML table mapping](https://www.postgresql.org/docs/current/functions-xml.html).
