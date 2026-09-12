# Research Handoff

## Result

Ten candidate records reviewed. Four image recommendations await parent verification. Six retain external rights gaps.
Six image copies were downloaded after license review and opened. Two copies were rejected for subject mismatch.
`candidates.json` contains all ten provider IDs, record IDs, exact source URLs, addresses, coordinates, categories, and mapping caveats.
`licenses.md` contains credits, notices, source links, hashes, and individual visual findings.
No public assets, database writes, importer edits, publishing edits, scheduler edits, runtime starts, deployments, or Git operations occurred.

## Identity Checks

Fetched the allowed private feed without credentials or a local service.
The feed reported 25 observations, 13 unique provider identities, and no next page.
Selected the newest observation for each provider identity.
Excluded Cheonggyecheon, Gyeongbokgung, and the already reviewed museum.
The three source matches in prior release evidence must not be assumed to include any of the ten remaining entries.

Fetched all ten exact public Visit Seoul source pages.
Confirmed public headings, addresses, descriptions, and source map coordinates.
Found every feed coordinate pair in the corresponding public HTML `data-map-y` and `data-map-x` values.
These remain approximate catalog pins. They are not verified entrances.
Gukseon and Soonhee Food share an identical pin despite different floors and units.
Public Garden is a cafe, not a park. Gukseon is a craft shop, not a museum.
Soonhee Food sells banchan and salted seafood; it is not the separate bindaetteok restaurant.
Jongmyo's source has stale 2024 closure text despite its 2026 edit date.
No current operating status was inferred from an edit date alone.

The official Gukseon shop confirms its floor, room, building, address, and phone.
Its footer reserves copyright. No permission to reuse its product images was found.

## Local Mapping Leads

No databases were queried. All ten Localley UUIDs remain unknown.
Searched local `data/*.json` and enriched JSON for the ten names and major name tokens.
DDP and Gwangjang Market have matching local seed entries but no UUIDs in those entries.
Their Google place IDs are recorded only as existing local lookup leads. No Google API was called.
Other name searches found no local seed entry; this does not prove database absence.

The parent should query exact source URLs first, then inspect name/address/branch evidence for unresolved records.
Do not allocate replacement UUIDs before those checks.
Gwangjang's source has a linked `/shopping/` alias with the same article ID.
That alias is not byte-identical to the feed's `/Tourist-Attractions-list1/` URL.
Do not call it an existing exact source match until the parent checks stored URLs.
Keep the existing Gwangjang `Food` category until the parent reviews the proposed whole-market `Market` category.

## Bounded Source Log

Commons searches used the public MediaWiki API, namespace 6, three results per query unless noted.
Endpoint: `https://commons.wikimedia.org/w/api.php` with `action=query`, `generator=search`, `prop=imageinfo`, and `iiprop=url|extmetadata`.
The searches and results were:

| Query | Result |
| --- | --- |
| Gwangjang Market | Exact CC0 images by Bgag; selected Seoul 02 and fetched its file page. |
| Dongdaemun Design Plaza | Three licensed images; one has NoFoP and changed-Flickr-license warnings. Selected an official Archive image instead. |
| Jongmyo Shrine | Explicit KOGL Type 1 Jeongjeon image and two CC0 detail images. Selected the identifiable hall. |
| Sewoon Shopping Center | No results. |
| Sewoon OR Sewon Sangga, limit 4 | Mostly unrelated results; one 2008 surrounding-area photo. Not downloaded or approved. |
| Hyeongje | No results. |
| Gukseon | Unrelated military medal photograph. Rejected. |
| Jongoh | Olympic athlete photos. Rejected. |
| Public Garden Seoul | Historical books, not the cafe. Rejected. |
| Soonhee | Unrelated report. Rejected. |
| Mother and Daughter Gimbap | No results. |

Archive searches used its public GET form: `https://archive.visitseoul.net/en/search?searchTerm=...`.
Only the first bounded results page was examined.

| Search Term | Result |
| --- | --- |
| Sewoon | Five results. Opened ARP007jo1, ARP007lb1, and ARP007ev1; selected only the signed facade. |
| Dongdaemun Design Plaza | Fifty results; inspected first-page lead ARP007nc1, a Type 1 aerial. No pagination. |
| Hyeongje | Four unrelated royal-tomb results. Opened ARP0016e1 to confirm mismatch. |
| Gukseon | Six unrelated venues. Opened ARP005og1, Gugsijib, to confirm mismatch. |
| Jongoh; Jongno Underground | Zero results each. |
| Public Garden | Zero results. |
| Soonhee; Sunhuine | Zero results each. |
| Mother and Daughter; Gimbap | Zero results each. |

Additional exact Korean-name Archive searches also returned zero:

- `/en/search?searchTerm=%ED%8D%BC%EB%B8%94%EB%A6%AD%EA%B0%80%EB%93%A0`
- `/en/search?searchTerm=%ED%98%95%EC%A0%9C%EC%9C%A1%ED%9A%8C`
- `/ko/search?searchTerm=%EA%B5%AD%EC%84%A0%EC%98%BB%EC%B9%A0`
- `/ko/search?searchTerm=%EC%88%9C%ED%9D%AC%EB%84%A4%EB%B0%98%EC%B0%AC`
- `/ko/search?searchTerm=%EB%AA%A8%EB%85%80%EA%B9%80%EB%B0%A5`

Archive fuzzy matches are not identity proof. A search count alone never established an image match.
No blanket Visit Seoul gallery reuse grant was assumed.

## Source Limits

- `https://www.yukhoe.com/`: transport error. Stopped; no alternate access method or scraping fallback.
- `https://sisul.or.kr/gha/store/info.do?key=2309210001&sc_mallSn=6`: transport error. Stopped; no bypass.
- `https://www.gs5701.com/`: public official shop loaded; exact address and phone confirmed; All rights reserved.
- Heritage image page for `ccimId=6405753`: metadata shell only. Commons file-specific KOGL notice remains the verified license source.
- Archive capture dates and individual photographers were not disclosed on selected item pages. Kept unknown.
- Rights-gap outcomes mean no suitable rights were established in this bounded review, not that no licensed image can exist.

## Parent Gates

1. Resolve existing UUIDs and exact source mappings using authorized database reads.
2. Review category proposals without overwriting established curated data blindly.
3. Verify the four recommended image hashes, notices, subjects, and historical captions.
4. Preserve both KOGL and Archive policy links for Archive images.
5. Keep the six rights-gap candidates and two rejected image copies unpublished.
6. Perform publication and UI acceptance separately through the parent release process.

No UI screenshot or deployment check was performed. This task reviewed image files directly, not rendered venue cards.

## Verification

Local assertions passed on 2026-09-12:

- JSON parses and contains ten distinct provider identities.
- Four entries recommend reviewed images; six entries retain rights gaps with null image licenses.
- Every Localley UUID remains null and `publicationReady` remains false.
- All six files have JPEG magic bytes and SHA-256 values matching `licenses.md`.
- All four recommended image paths exist inside this research directory.
- A fresh allowed-feed read matched all ten names, record IDs, provider IDs, source URLs, addresses, and coordinate pairs.
- All six images were opened, not merely downloaded or checked by hash.
