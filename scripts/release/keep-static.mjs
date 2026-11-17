// Deploy skew guard (push-localley AF4). Workers static assets belong to one Worker version. Right after a promote,
// pages rendered by the previous version (edge-cached HTML, open tabs that lazy-load a route) still ask for the previous
// build's hashed /_next/static chunks; the new version did not have them, so they returned 404 (ChunkLoadError) for
// about a minute on 2026-11-17. Each release therefore also uploads the previous release's chunks. Hashed names never
// collide with different content, and the new build's own files always win. Only one release back is kept: the archive
// holds the live build's own files, never carried ones, so it does not grow.
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

// Workers static assets allow 20 000 files per version; stay below with room for growth.
export const MAX_ASSET_FILES = 19_000;

/** Relative paths of all files below dir (empty when dir is missing). */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)))
    .sort();
}

/**
 * Copies files of the archive that the new build lacks into staticDir. Never overwrites. Returns
 * { added, skipped } where skipped names the reason nothing was carried.
 */
export function carryPrevious(archiveDir, staticDir, { assetFiles, maxFiles = MAX_ASSET_FILES } = {}) {
  const previous = listFiles(archiveDir);
  if (!previous.length) return { added: 0, skipped: "no-archive" };
  const missing = previous.filter((file) => !existsSync(path.join(staticDir, file)));
  if ((assetFiles ?? listFiles(staticDir).length) + missing.length > maxFiles) return { added: 0, skipped: "file-limit" };
  for (const file of missing) {
    mkdirSync(path.dirname(path.join(staticDir, file)), { recursive: true });
    cpSync(path.join(archiveDir, file), path.join(staticDir, file), { errorOnExist: true, force: false });
  }
  return { added: missing.length, skipped: null };
}

/** Replaces archiveDir with a copy of ownDir (the build's own files), via a sibling temp dir and rename. */
export function replaceArchive(ownDir, archiveDir) {
  const temp = `${archiveDir}.next`;
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(path.dirname(archiveDir), { recursive: true });
  cpSync(ownDir, temp, { recursive: true });
  rmSync(archiveDir, { recursive: true, force: true });
  renameSync(temp, archiveDir);
}
