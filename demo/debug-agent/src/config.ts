import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
export const ENV_PATH = path.join(PACKAGE_ROOT, '.env');
export const ENV_LOCAL_PATH = path.join(PACKAGE_ROOT, '.env.local');

function loadEnvFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        return;
    }
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

// .env is for secrets you edit (CURSOR_API_KEY). .env.local is written by
// provision.py (bot token). Load .env first, then .env.local so provisioned
// values fill in without overriding an exported shell env.
loadEnvFile(ENV_PATH);
loadEnvFile(ENV_LOCAL_PATH);

export type Config = {
    mattermostUrl: string;
    botToken: string;
    cursorApiKey: string | null;
    cursorModel: string;
    dryRun: boolean;
    runtime: 'local' | 'cloud';
    repoRoot: string;
    cloudRepoUrl: string;
    cloudStartingRef: string;
    agentTimeoutMs: number;
};

export function loadConfig(): Config {
    const dryRun = process.env.DEBUG_AGENT_DRY_RUN === '1' || process.env.DEBUG_AGENT_DRY_RUN === 'true';
    const botToken = process.env.MATTERMOST_BOT_TOKEN?.trim() ?? '';
    const cursorApiKey = process.env.CURSOR_API_KEY?.trim() || null;
    const mattermostUrl = (process.env.MATTERMOST_URL ?? 'http://localhost:8065').replace(/\/$/, '');
    const runtimeEnv = (process.env.DEBUG_AGENT_RUNTIME ?? 'cloud').trim().toLowerCase();
    const runtime: 'local' | 'cloud' = runtimeEnv === 'local' ? 'local' : 'cloud';

    if (!botToken) {
        throw new Error(
            'MATTERMOST_BOT_TOKEN is missing. Run `python3 demo/debug-agent/provision.py` first (or `make demo-agent`).',
        );
    }

    if (!dryRun && !cursorApiKey) {
        throw new Error(
            'CURSOR_API_KEY is required (or set DEBUG_AGENT_DRY_RUN=1 to exercise Mattermost plumbing without the SDK).',
        );
    }

    return {
        mattermostUrl,
        botToken,
        cursorApiKey,
        cursorModel: process.env.CURSOR_MODEL?.trim() || 'composer-2.5',
        dryRun,
        runtime,
        repoRoot: process.env.DEBUG_AGENT_REPO_ROOT?.trim() || REPO_ROOT,
        cloudRepoUrl:
            process.env.CURSOR_CLOUD_REPO?.trim() ||
            'https://github.com/tunaSandwich/mattermost.git',
        cloudStartingRef: process.env.CURSOR_CLOUD_REF?.trim() || 'master',
        agentTimeoutMs: Number(process.env.DEBUG_AGENT_TIMEOUT_MS ?? 5 * 60 * 1000),
    };
}
