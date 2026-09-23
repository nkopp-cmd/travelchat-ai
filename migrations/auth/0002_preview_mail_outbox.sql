-- Test mailbox. Written only when AUTH_MAIL_MODE=outbox (preview Worker, local dev, tests).
-- Production sends through Resend and never writes here.
create table "auth_mail_outbox" ("id" integer primary key autoincrement, "kind" text not null, "email" text not null, "url" text not null, "createdAt" integer not null);
create index "auth_mail_outbox_email_idx" on "auth_mail_outbox" ("email", "id");
