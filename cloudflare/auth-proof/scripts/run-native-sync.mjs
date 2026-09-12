// Timer entry point. Pass only the needed shared credential to the existing bounded importer.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const token = parseEnv(readFileSync(`${homedir()}/secrets/keys.env`, 'utf8')).CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Existing Cloudflare credential is missing');
const root = new URL('../', import.meta.url);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/native-sync.mjs', root)), '--apply'], {
  cwd: fileURLToPath(root), env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
  stdio: 'inherit', timeout: 170000,
});
if (result.error) throw new Error(`Native sync process failed: ${result.error.code}`);
process.exitCode = result.status ?? 1;
