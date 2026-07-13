import type {ThreadManager} from './thread.js';

export type ProgressEvent =
    | {type: 'tool'; name: string; detail?: string}
    | {type: 'assistant_delta'; text: string}
    | {type: 'status'; text: string};

const MAX_MILESTONE_POSTS = 3;

function describeTool(name: string, detail?: string): string | null {
    const lower = name.toLowerCase();
    if (lower.includes('read') || lower.includes('open') || lower.includes('cat')) {
        return detail
            ? `Reading \`${detail}\`…`
            : 'Reading files in the repo…';
    }
    if (lower.includes('grep') || lower.includes('search') || lower.includes('find')) {
        return detail
            ? `Searching the codebase for \`${detail}\`…`
            : 'Searching the codebase…';
    }
    if (lower.includes('shell') || lower.includes('bash') || lower.includes('terminal')) {
        return 'Running a read-only inspection command…';
    }
    if (lower.includes('list') || lower.includes('glob') || lower.includes('ls')) {
        return 'Exploring the repo layout…';
    }
    return null;
}

/** Build a Cursor Agents UI URL when the agent id is cloud-visible (`bc-…`). */
export function agentViewUrl(agentId: string): string | null {
    if (!agentId) {
        return null;
    }
    // Cloud agent IDs are opened at cursor.com/agents/<id>
    if (agentId.startsWith('bc-')) {
        return `https://cursor.com/agents/${agentId}`;
    }
    return null;
}

/**
 * Selective progress narration from real Cursor SDK stream events.
 * All posts go through ThreadManager's sequential queue.
 */
export class ProgressNarrator {
    private milestoneCount = 0;
    private seenTools = new Set<string>();
    private readonly threads: ThreadManager;
    private readonly channelId: string;
    private readonly rootId: string;
    private postedViewLink = false;

    constructor(threads: ThreadManager, channelId: string, rootId: string) {
        this.threads = threads;
        this.channelId = channelId;
        this.rootId = rootId;
    }

    /** Post a "view this run" link once the agent id is known. */
    async postViewLink(agentId: string, runId?: string): Promise<void> {
        if (this.postedViewLink) {
            return;
        }
        this.postedViewLink = true;

        const url = agentViewUrl(agentId);
        if (url) {
            const runNote = runId ? ` (run \`${runId}\`)` : '';
            await this.threads.postReply(
                this.channelId,
                this.rootId,
                `Working on it — [view this run in Cursor](${url})${runNote}`,
            );
            return;
        }

        // Local agents aren't listed in the Agents UI; still surface the id.
        const runNote = runId ? `, run \`${runId}\`` : '';
        await this.threads.postReply(
            this.channelId,
            this.rootId,
            `Working on it — local agent \`${agentId}\`${runNote}. ` +
                'Local SDK runs aren’t in the Agents window; set `DEBUG_AGENT_RUNTIME=cloud` for a web link.',
        );
    }

    async onStreamEvent(event: ProgressEvent): Promise<void> {
        if (this.milestoneCount >= MAX_MILESTONE_POSTS) {
            return;
        }
        if (event.type !== 'tool') {
            return;
        }

        if (this.seenTools.has(event.name)) {
            return;
        }
        this.seenTools.add(event.name);

        const message = describeTool(event.name, event.detail);
        if (!message) {
            return;
        }

        this.milestoneCount += 1;
        await this.threads.postReply(this.channelId, this.rootId, message);
    }
}
