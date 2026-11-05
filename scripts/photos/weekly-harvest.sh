#!/usr/bin/env bash
# Weekly own-photo harvest for new top spots (plan localley-spot-photo-library step 5). Host cron (hybrid rule:
# runs by itself -> our server, not Cloudflare), Monday 03:10 UTC. Subscription vision check only (codex exec, $0).
# It harvests, reviews and uploads to R2 (unlisted keys serve 404 until a row exists). It NEVER writes spot_photos:
# the builder hand-checks the "yes" photos (real place only), then runs insert-photos.mjs --apply + make-thumbs.mjs.
# Bounded: --skip-done (spots without a photo only), top 100 per city, one run per week, flock + 3 h timeout.
set -u
APP=/home/dev/projects/CyberLink/apps/Localley
RUN=/home/dev/.local/share/localley/photo-harvest
OUT=/home/dev/projects/CyberLink/claude-work/photo-weekly/$(date -u +%F)
export PATH="/home/dev/.local/bin:/home/dev/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
export CLOUDFLARE_API_TOKEN="$(grep -m1 '^CLOUDFLARE_API_TOKEN=' /home/dev/secrets/keys.env | cut -d= -f2-)"
export CLOUDFLARE_ACCOUNT_ID=664f242340bcec2f32daaeee15f58bde
mkdir -p "$RUN" "$OUT" /home/dev/.local/state/localley

# Run the scripts as they are on origin/main (not the builder's working tree).
git -C "$APP" fetch -q origin main || exit 1
for f in $(git -C "$APP" ls-tree --name-only origin/main scripts/photos/ | grep '\.mjs$'); do
  git -C "$APP" show "origin/main:$f" > "$RUN/$(basename "$f")" || exit 1
done
git -C "$APP" show origin/main:lib/cities.ts > "$RUN/cities.ts" || exit 1
if [ ! -d "$RUN/node_modules/sharp" ]; then
  printf '%s\n' '{"name":"photo-harvest","private":true,"type":"module","dependencies":{"sharp":"0.34.5"}}' > "$RUN/package.json"
  (cd "$RUN" && npm install --no-audit --no-fund --silent) || exit 1
fi

cd "$RUN" || exit 1
flock -n /home/dev/.local/state/localley/photo-weekly.lock timeout 10800 \
  node commons-harvest.mjs --out "$OUT" --city all --limit 100 --per-spot 2 --skip-done --review --upload \
  --cities "$RUN/cities.ts" > "$OUT/harvest.log" 2>&1
rc=$?
yes=$(node -e 'const m=require(process.argv[1]);console.log(m.photos.filter(p=>p.review==="yes").length)' "$OUT/manifest.json" 2>/dev/null || echo 0)
echo "$(date -u +%FT%TZ) rc=$rc yes=$yes out=$OUT -> builder: hand-check $OUT/img, then insert-photos.mjs --manifest $OUT/manifest.json --approved-by harvester-commons --apply; make-thumbs.mjs"
exit $rc
