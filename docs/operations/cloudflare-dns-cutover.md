# Cloudflare DNS Cutover

Checked on 2026-09-08. No nameserver change has been made by the assistant.

## Current State

The user added `localley.io` to the intended Cloudflare account.
Zone `34780b243d4a2f10a300f5586d229c8b` is pending activation.
The existing API token can read and edit this zone's DNS records.
Email Sending management still returns authentication error `10000` for this specific zone.
Do not report DNS access itself as blocked.

Assigned Cloudflare nameservers:

- `igor.ns.cloudflare.com`
- `norah.ns.cloudflare.com`

Current authoritative nameservers remain:

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

## Remaining Gate

Compare the full Name.com DNS record list or zone export before approving the nameserver change.
Targeted public lookups cannot establish that no other subdomains or verification records exist.
Do not rely on the automatic scan alone.

After that comparison, the user can replace the four Name.com nameservers with the two assigned Cloudflare nameservers.
Then verify delegation, website access, sign-in, incoming mail, and sender records from multiple resolvers.
Do not enable proxy changes, alter mail routing, or retire services during that DNS-only step.

Changing nameservers moves DNS management only.
Vercel, Supabase, and Clerk remain temporary application dependencies until the separate application cutover passes.
Their required DNS records must remain during that transition.
