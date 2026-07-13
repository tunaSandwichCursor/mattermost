import './polyfill.js';

import mattermost from '@mattermost/client';
import type {WebSocketMessage} from '@mattermost/client';

import {
    createCursorRunner,
    createDryRunRunner,
    handleAgentTurn,
    type AgentRunner,
} from './agent.js';
import {loadConfig, type Config} from './config.js';
import {decideMention, type PostedEventData} from './mention.js';
import {ProgressNarrator} from './progress.js';
import {ThreadManager} from './thread.js';

const {Client4, WebSocketClient, WebSocketEvents} = mattermost;
function toWsUrl(httpUrl: string): string {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Strip trailing slash, then append the API websocket path.
    const origin = url.origin.replace(/\/$/, '');
    return `${origin}/api/v4/websocket`;
}

async function main(): Promise<void> {
    const config = loadConfig();
    console.log(`[debug-agent] starting (dryRun=${config.dryRun}) against ${config.mattermostUrl}`);

    const client = new Client4();
    client.setUrl(config.mattermostUrl);
    client.setToken(config.botToken);
    // Node has no cookies; keep REST auth on the Bearer token only.
    client.setIncludeCookies(false);

    let me;
    try {
        me = await client.getMe();
    } catch (err) {
        throw new Error(
            `Bot token is invalid or the server is unreachable (${String(err)}). ` +
                'Re-run provisioning: `python3 demo/debug-agent/provision.py` (or `make demo-agent`).',
        );
    }

    if (me.username !== 'debug') {
        throw new Error(
            `Token belongs to @${me.username}, expected @debug. Re-run provisioning.`,
        );
    }

    console.log(`[debug-agent] authenticated as @${me.username} (${me.id})`);

    const threads = new ThreadManager(client, me.id);
    const runner: AgentRunner = config.dryRun
        ? createDryRunRunner()
        : await createCursorRunner(config);

    const ws = new WebSocketClient();
    const wsUrl = toWsUrl(config.mattermostUrl);

    ws.addFirstConnectListener(() => {
        console.log('[debug-agent] websocket connected');
    });
    ws.addReconnectListener(() => {
        console.log('[debug-agent] websocket reconnected');
    });
    ws.addCloseListener((failCount) => {
        console.warn(`[debug-agent] websocket closed (failCount=${failCount})`);
    });
    ws.addErrorListener((event) => {
        console.error('[debug-agent] websocket error:', event);
    });

    ws.addMessageListener((msg: WebSocketMessage) => {
        void onMessage(msg, config, client, threads, runner, me.id);
    });

    console.log(`[debug-agent] connecting websocket ${wsUrl}`);
    ws.initialize(wsUrl, config.botToken);

    const shutdown = () => {
        console.log('[debug-agent] shutting down');
        try {
            ws.close();
        } catch {
            // ignore
        }
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

async function onMessage(
    msg: WebSocketMessage,
    config: Config,
    client: InstanceType<typeof Client4>,
    threads: ThreadManager,
    runner: AgentRunner,
    botUserId: string,
): Promise<void> {
    if (msg.event !== WebSocketEvents.Posted) {
        return;
    }

    const data = (msg.data ?? {}) as PostedEventData;
    const decision = decideMention(data, botUserId);
    if (!decision.shouldHandle) {
        return;
    }

    const {post, rootId} = decision;
    console.log(
        `[debug-agent] trigger rootId=${rootId} channel=${post.channel_id} from=${post.user_id} dm=${decision.isDm}`,
    );

    if (threads.isBusy(rootId)) {
        await threads.postReply(
            post.channel_id,
            rootId,
            'Still working on the last request in this thread — hang tight.',
        );
        return;
    }

    threads.setBusy(rootId, true);
    const progress = new ProgressNarrator(threads, post.channel_id, rootId);

    try {
        await handleAgentTurn({
            runner,
            config,
            client,
            threads,
            progress,
            post,
            rootId,
            channelName: data.channel_display_name || data.channel_name,
        });
    } catch (err) {
        console.error('[debug-agent] unhandled turn error:', err);
        try {
            await threads.postReply(
                post.channel_id,
                rootId,
                `⚠️ Something went wrong in the bridge: ${err instanceof Error ? err.message : String(err)}`,
            );
        } catch {
            // ignore secondary failures
        }
    } finally {
        threads.setBusy(rootId, false);
    }
}

main().catch((err) => {
    console.error('[debug-agent] fatal:', err);
    process.exit(1);
});
