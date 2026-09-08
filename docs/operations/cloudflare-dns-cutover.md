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

The user completed Email Sending onboarding, which added Cloudflare bounce MX, SPF, DKIM, and DMARC records.
The generated DMARC policy was `p=reject`, while the supplied source inventory had no Google SPF or DKIM records.
The user explicitly approved temporarily changing only that policy to `p=none`.
Verify Google Workspace sender authentication and received headers before restoring enforcement.
The five Google Workspace MX records remain unchanged.

The user approved one test message to their existing account address.
Exactly one native Workers Email binding call was made, and Cloudflare returned an accepted message ID.
No login link, customer data, attachment, or tracking pixel was included.
Delivery is not yet confirmed by the recipient. The receipt remains in ignored private release metadata.
Temporary test code and local processes were removed; no public send endpoint or lasting test Worker remains.
No billing configuration was changed.

The API token still cannot read the Email Sending management endpoint.
That limitation did not prevent the authorized native Workers binding from accepting the test message.
Do not confuse management API access with the verified sending path.

Next, confirm receipt and inspect authentication results before connecting real signup and recovery email.
A successful send to one approved address does not prove general sending eligibility for all future recipients.
Verify the account plan and sender limits before activating public authentication email.
Keep Google Workspace MX records unchanged. Do not enable Email Routing as a substitute for Email Sending.
If onboarding requires a new paid plan, obtain approval for that recurring charge first.

Changing nameservers moves DNS management only.
Vercel, Supabase, and Clerk remain temporary application dependencies until the separate application cutover passes.
Their required DNS records must remain during that transition.
