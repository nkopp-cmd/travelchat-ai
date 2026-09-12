# Native Image Permission Requests

## Current Gate

Task `usable-native-discovery` remains incomplete. The existing eight published venues have reviewed images, but six additional business images lack exact-site reuse evidence.
No new permission, asset, or rights-holder response arrived with the repeated continuation instruction.
This document prepares the next external step; it is not a license grant or publication approval.

## New Source Check

PHOTO KOREA was found through the official VisitKorea homepage link, not inferred from a domain name:
https://phoko.visitkorea.or.kr/en/main/index.kto

Its displayed guidelines require registration for use/download, use for the requested purpose, photographer attribution, and separate compliance with each asset's KOGL type.
Its membership terms also prohibit commercial service use without prior consent. The terms distinguish downloadable content from view-only material.
Public thumbnails and a general KOGL explanation do not establish a license for a specific venue photograph.
No account was created, terms accepted, original image downloaded, or download gate bypassed.

The initial guessed photo domain was unreachable, and a guessed VisitKorea search route returned 404. Those attempts established no catalog result.
The official homepage supplied the working PHOTO KOREA URL.
The media page's initial `0 items` is a loading placeholder, not a search result.
The page documents a public POST to `/en/media/mediaList_ajax.kto` using its serialized search form.
The review used that public metadata endpoint with `firstRecordIndex=0`, `lastRecordIndex=35`, and the page's empty/default filters.

| Provider | Korean Query | English Query | Returned Items |
| --- | --- | --- | --- |
| visit-seoul:51933 | Exact Korean name from the retained source review | Hyeongje Yukhoe | 0 / 0 |
| visit-seoul:24725 | Exact Korean name from the retained source review | Gukseon | 0 / 0 |
| visit-seoul:508 | Exact Korean name from the retained source review | Jongoh Underground Shopping Center | 0 / 0 |
| visit-seoul:47532 | Exact Korean name from the retained source review | Public Garden | 0 / 0 |
| visit-seoul:26253 | Exact Korean name from the retained source review | Sunhuine Banchan | 0 / 0 |
| visit-seoul:14618 | Exact Korean name from the retained source review | Mother and Daughter Gimbap | 0 / 0 |

All twelve responses were HTTP 200 and explicitly reported `mediaPageListcount = 0`.
A positive control using the homepage's listed `Seoul Forest` returned 35 items through the same request path.
This verifies the request method, not the absence of relevant images everywhere in the archive.
No result pagination, media download, collector job, or paid fallback followed these checks.
Private evidence: `cloudflare/auth-proof/.preview-private/phoko-metadata-review.json`, `phoko-metadata-control.json`, and the corresponding HTML responses.

## Ready Request

Status: DRAFT, NOT SENT.
Intended contact: Seoul Tourism Organization's public contact, `staff@visitseoul.net`, asking for referral to the appropriate photo-rights team.
Contact source: the footer of the matched official Visit Seoul venue pages.
Sender and sending channel must be approved for rights outreach. The preview auth mail binding permits only `auth@localley.io` to the allowlisted reviewer; it must not be repurposed or widened for this request.

Subject: Photo reuse permission inquiry for six exact Seoul venues on Localley

Hello Seoul Tourism Organization photo-rights team,

Localley is a commercial travel discovery website at https://localley.io. We would like to request authentic photographs of the exact venues listed below for their venue-information pages.

Could you provide photographs that your organization has authority to license, or direct us to the relevant rights holder? We need permission for commercial website display and hosting, including delivery through our website's image storage/CDN, with photographer, source, and license attribution.

Please identify each photograph, its photographer/rightsholder, capture date if known, and the exact venue or branch it depicts. Please also specify whether technical resizing or compression is permitted, and any expiry, territory, or other rights restrictions. We do not intend to sell the photographs as standalone files or make AI-generated alterations.

An asset-specific existing public license would also be useful. A general site policy or approval to view an image is not enough for us to publish it.

| Venue | Exact Site | Official Listing |
| --- | --- | --- |
| Hyeongje Yukhoe Main | Main branch, 200-1 Jong-ro, Jongno-gu | https://english.visitseoul.net/restaurants/HyungjeYukhoeMain/ENPeab5ni |
| Gukseon Otchil | Unit 2390, third floor, 88 Changgyeonggung-ro | https://english.visitseoul.net/attractions/Guksun-Mother-Of-Pearl-Inlay-and-Lacquerware/ENP024705 |
| Jongoh Underground Shopping Center | Underground arcade, 200 Jong-ro | https://english.visitseoul.net/shopping/Jongoh-Underground-Shopping-Center/ENP000502 |
| Public Garden | Fourth-floor cafe, 199 Cheonggyecheon-ro | https://english.visitseoul.net/restaurants/2024-publicgarden/ENP49ib1g |
| Soonhee Food / Sunhuine Banchan | Banchan shop, unit 65-1, first floor of Gwangjang Market, 88 Changgyeonggung-ro; not the pancake restaurant | https://english.visitseoul.net/restaurants/Sunhuine-Banchan/ENP026193 |
| Mother and Daughter's Gimbap | Exact branch/stall in the linked listing; please confirm address and branch identity | https://english.visitseoul.net/restaurants/Mother-and-Daughters-Gimbap1/ENP014615 |

For the gimbap listing, please confirm the exact branch or stall before identifying a photograph. We want to avoid confusing similarly named businesses or older locations.

This is a permission inquiry only. It does not authorize fees or commit us to use an image. We will not publish a photograph until its exact-site association and reuse permission are verified.

Thank you,
Localley project team

## Grant Acceptance

Keep the original rights-holder response private and retain its date and provenance.
Require an identified asset or delivered original, exact venue/branch, granting party's authority, commercial hosting/display scope, required credit, and any restrictions.
Hash the actual image bytes, review the image itself, and retain the grant before adding a publication approval.
Do not convert a sent inquiry, account registration, generic approval, or a nearby market photograph into an accepted venue image.
The six blocked candidates and their publication controls remain unchanged until that evidence exists.
