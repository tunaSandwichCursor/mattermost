import type {Client4} from '@mattermost/client';

type QueueTask = () => Promise<void>;

type ThreadState = {
    cursorAgentId: string | null;
    busy: boolean;
    queue: Promise<void>;
};

/**
 * Per-thread session + sequential reply queue.
 *
 * All replies for a given rootId flow through one chain so staged beats,
 * real milestones, and the final answer always post in order.
 */
export class ThreadManager {
    private readonly threads = new Map<string, ThreadState>();
    private readonly client: Client4;
    private readonly botUserId: string;

    constructor(client: Client4, botUserId: string) {
        this.client = client;
        this.botUserId = botUserId;
    }

    getState(rootId: string): ThreadState {
        let state = this.threads.get(rootId);
        if (!state) {
            state = {cursorAgentId: null, busy: false, queue: Promise.resolve()};
            this.threads.set(rootId, state);
        }
        return state;
    }

    isBusy(rootId: string): boolean {
        return this.getState(rootId).busy;
    }

    setBusy(rootId: string, busy: boolean): void {
        this.getState(rootId).busy = busy;
    }

    getAgentId(rootId: string): string | null {
        return this.getState(rootId).cursorAgentId;
    }

    setAgentId(rootId: string, agentId: string): void {
        this.getState(rootId).cursorAgentId = agentId;
    }

    /**
     * Enqueue a reply so posts for this thread never race each other.
     */
    enqueueReply(rootId: string, task: QueueTask): Promise<void> {
        const state = this.getState(rootId);
        const next = state.queue.then(task, task);
        // Keep the chain alive even if a task rejects.
        state.queue = next.catch((err) => {
            console.error(`[thread ${rootId}] reply queue error:`, err);
        });
        return next;
    }

    /** Create a post without going through the queue (caller must already be serialized). */
    async createPostNow(channelId: string, rootId: string, message: string): Promise<void> {
        await this.client.createPost({
            channel_id: channelId,
            root_id: rootId,
            message,
        });
    }

    async postReply(channelId: string, rootId: string, message: string): Promise<void> {
        await this.enqueueReply(rootId, async () => {
            await this.createPostNow(channelId, rootId, message);
        });
    }

    getBotUserId(): string {
        return this.botUserId;
    }
}
