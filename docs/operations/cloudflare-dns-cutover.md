# Cloudflare DNS Cutover

Checked on 2026-09-08. No nameserver change has been made by the assistant.

## Current State

The user added `localley.io` to the intended Cloudflare account.
Zone `34780b243d4a2f10a300f5586d229c8b` became active on 2026-09-08 at 19:56:50 UTC.
The existing API token can read and edit this zone's DNS records.
Email Sending management still returns authentication error `10000` for this specific zone.
Do not report DNS access itself as blocked.

Assigned Cloudflare nameservers:

- `igor.ns.cloudflare.com`
- `norah.ns.cloudflare.com`

The user supplied the full Name.com inventory. All 14 destinations and mail priorities matched the prepared zone.
The user then saved the assigned Cloudflare nameservers at Name.com.
Cloudflare and Google resolvers confirmed the new delegation before Cloudflare marked the zone active.

Previous nameservers, retained here only as historical reference:

- `ns1jsv.name.com`
- `ns2clp.name.com`
- `ns3jkl.name.com`
- `ns4fmw.name.com`

## Prepared Records

The initial Cloudflare scan contained nine records and omitted Clerk's five records.
The missing CNAMEs were checked against current DNS before being copied:

| Name | Target |
| --- | --- |
| `clerk.localley.io` | `frontend-api.clerk.services` |
| `accounts.localley.io` | `accounts.clerk.services` |
| `clkmail.localley.io` | `mail.8ctyr4bondf7.clerk.services` |
| `clk._domainkey.localley.io` | `dkim1.8ctyr4bondf7.clerk.services` |
| `clk2._domainkey.localley.io` | `dkim2.8ctyr4bondf7.clerk.services` |

All five are DNS-only.
The existing website A and CNAME records were also set to DNS-only in the pending zone.
Their targets were not changed:

- `localley.io` A: `216.198.79.1`.
- `www.localley.io` CNAME: `8597cfc582a3e8e6.vercel-dns-017.com`.

The five Google Workspace MX records and two Google verification TXT records were preserved.
Cloudflare now contains 14 records.
Direct queries to `igor.ns.cloudflare.com` confirmed the website, Clerk frontend, Google MX, and TXT responses.

Cloudflare DNSSEC is disabled, and the public DS lookup returned no DS record.
Recheck both immediately before changing nameservers.

## Completed DNS Gate

The full source inventory was compared before the nameserver change.
Targeted checks alone were not treated as a complete inventory.
After activation, the live Seoul map and sign-in page returned HTTP 200.
Clerk's HTTPS signing-key endpoint also returned HTTP 200.
These checks do not prove inbox delivery or complete an application authentication migration.

## Next Gate

Onboard `localley.io` in Cloudflare Email Sending through authorized access.
The current token still receives HTTP 403 and code `10000` from this zone's Email Sending endpoint.
Review proposed sender, SPF, DKIM, and DMARC records before confirming them.
Keep Google Workspace MX records unchanged. Do not enable Email Routing as a substitute for Email Sending.
If onboarding requires a new paid plan, obtain approval for that recurring charge first.
No Email Sending configuration, message delivery, or new subscription was created in this DNS step.

Changing nameservers moves DNS management only.
Vercel, Supabase, and Clerk remain temporary application dependencies until the separate application cutover passes.
Their required DNS records must remain during that transition.
