import type {Client4} from '@mattermost/client';

import type {Config} from './config.js';
import {stripDebugMention, type IncomingPost} from './mention.js';
import type {ProgressEvent, ProgressNarrator} from './progress.js';
import type {ThreadManager} from './thread.js';

const READ_ONLY_PREAMBLE = `You are @debug, a debugging assistant inside a Mattermost chat for the Mattermost monorepo.

Rules:
- Investigate the repository only. Do NOT edit files, create commits, open PRs, or run state-changing commands.
- Prefer reading code and searching; if you use a shell, stick to read-only commands (ls, cat, rg, git status, git log, git show, git diff).
- Answer in Mattermost-friendly markdown. Be concise and concrete: cite file paths and the key mechanism.
- The user's question is about this codebase unless they clearly say otherwise.
`;

export type AgentRunResult = {
    text: string;
    agentId: string;
    runId?: string;
    status: 'finished' | 'error' | 'cancelled';
    errorMessage?: string;
};

export type AgentRunner = {
    run: (args: {
        rootId: string;
        existingAgentId: string | null;
        prompt: string;
        onEvent: (event: ProgressEvent) => Promise<void>;
        onStarted?: (info: {agentId: string; runId?: string}) => Promise<void>;
        timeoutMs: number;
    }) => Promise<AgentRunResult>;
};

function toolDetailFromArgs(args: unknown): string | undefined {
    if (!args || typeof args !== 'object') {
        return undefined;
    }
    const a = args as Record<string, unknown>;
    for (const key of ['path', 'file_path', 'filePath', 'target_file', 'pattern', 'query', 'glob', 'command']) {
        if (typeof a[key] === 'string' && a[key]) {
            return a[key] as string;
        }
    }
    return undefined;
}

function extractToolEvent(event: any): ProgressEvent | null {
    if (!event || typeof event !== 'object') {
        return null;
    }

    // SDKToolUseMessage shape from @cursor/sdk
    if (event.type === 'tool_call' && event.status === 'running') {
        return {
            type: 'tool',
            name: String(event.name ?? 'tool'),
            detail: toolDetailFromArgs(event.args),
        };
    }

    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
            if (block?.type === 'tool_use') {
                return {
                    type: 'tool',
                    name: String(block.name ?? 'tool'),
                    detail: toolDetailFromArgs(block.input),
                };
            }
        }
    }

    return null;
}

function extractAssistantText(event: any): string {
    if (!event || event.type !== 'assistant') {
        return '';
    }
    const content = event.message?.content;
    if (!Array.isArray(content)) {
        return typeof event.message?.content === 'string' ? event.message.content : '';
    }
    return content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('');
}

export function createDryRunRunner(): AgentRunner {
    return {
        async run({existingAgentId, prompt, onEvent, onStarted, timeoutMs}) {
            // Fake a cloud id so dry-run posts the same view-link shape as production.
            const agentId = existingAgentId ?? `bc-dry-run-${Date.now()}`;
            const runId = `dry-run-${Date.now()}`;
            console.log(`[agent] dry-run start agentId=${agentId}`);

            await onStarted?.({agentId, runId});
            await new Promise((r) => setTimeout(r, 400));
            await onEvent({type: 'tool', name: 'readFile', detail: 'Makefile'});
            await new Promise((r) => setTimeout(r, 400));
            await onEvent({type: 'tool', name: 'grep', detail: 'demo'});
            await new Promise((r) => setTimeout(r, 400));

            if (timeoutMs < 1000) {
                return {
                    text: '',
                    agentId,
                    status: 'cancelled',
                    errorMessage: 'dry-run timeout',
                };
            }

            const text =
                '**(dry-run)** I would inspect the root `Makefile` and `demo/seed.sh` for that.\n\n' +
                `Your question: ${prompt.slice(0, 280)}\n\n` +
                'Set `DEBUG_AGENT_DRY_RUN=0` and provide `CURSOR_API_KEY` for a real Cursor agent answer.';

            return {text, agentId, runId, status: 'finished'};
        },
    };
}

export async function createCursorRunner(config: Config): Promise<AgentRunner> {
    const {Agent, CursorAgentError} = await import('@cursor/sdk');

    return {
        async run({existingAgentId, prompt, onEvent, onStarted, timeoutMs}) {
            let agent: any;
            try {
                if (existingAgentId) {
                    console.log(`[agent] resuming agentId=${existingAgentId}`);
                    agent = await Agent.resume(existingAgentId, {
                        apiKey: config.cursorApiKey!,
                    });
                } else if (config.runtime === 'cloud') {
                    console.log(
                        `[agent] creating cloud agent repo=${config.cloudRepoUrl} ref=${config.cloudStartingRef} model=${config.cursorModel}`,
                    );
                    agent = await Agent.create({
                        apiKey: config.cursorApiKey!,
                        model: {id: config.cursorModel},
                        cloud: {
                            repos: [
                                {
                                    url: config.cloudRepoUrl,
                                    startingRef: config.cloudStartingRef,
                                },
                            ],
                        },
                    });
                } else {
                    console.log(`[agent] creating local agent cwd=${config.repoRoot} model=${config.cursorModel}`);
                    agent = await Agent.create({
                        apiKey: config.cursorApiKey!,
                        model: {id: config.cursorModel},
                        local: {cwd: config.repoRoot},
                    });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const retryable = err instanceof CursorAgentError ? Boolean((err as any).isRetryable) : false;
                return {
                    text: '',
                    agentId: existingAgentId ?? '',
                    status: 'error',
                    errorMessage: `Couldn't start the Cursor agent (${retryable ? 'retryable' : 'fatal'}): ${message}`,
                };
            }

            const agentId: string = agent.agentId ?? agent.agent_id ?? existingAgentId ?? '';
            console.log(`[agent] agentId=${agentId}`);

            try {
                const run = await agent.send(prompt);
                console.log(`[agent] run.id=${run.id}`);
                await onStarted?.({agentId, runId: run.id});

                let assembled = '';
                const streamTask = (async () => {
                    try {
                        for await (const event of run.stream()) {
                            const tool = extractToolEvent(event);
                            if (tool) {
                                await onEvent(tool);
                            }
                            const delta = extractAssistantText(event);
                            if (delta) {
                                assembled += delta;
                            }
                        }
                    } catch (streamErr) {
                        console.error('[agent] stream error:', streamErr);
                    }
                })();

                const result = await Promise.race([
                    run.wait().then(async (r: any) => {
                        await streamTask;
                        return r;
                    }),
                    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
                ]);

                if (result === 'timeout') {
                    if (typeof run.cancel === 'function' && run.supports?.('cancel')) {
                        try {
                            await run.cancel();
                        } catch {
                            // ignore
                        }
                    }
                    return {
                        text: '',
                        agentId,
                        runId: run.id,
                        status: 'cancelled',
                        errorMessage: `The agent timed out after ${Math.round(timeoutMs / 1000)}s. Try a narrower question.`,
                    };
                }

                if (result.status === 'error') {
                    return {
                        text: '',
                        agentId,
                        runId: result.id ?? run.id,
                        status: 'error',
                        errorMessage: 'The Cursor agent ran but failed mid-flight. Check the bridge logs for run.id.',
                    };
                }

                const text =
                    (typeof result.result === 'string' && result.result) ||
                    assembled ||
                    '(no text returned from the agent)';

                return {
                    text,
                    agentId,
                    runId: result.id ?? run.id,
                    status: 'finished',
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (err instanceof CursorAgentError) {
                    return {
                        text: '',
                        agentId,
                        status: 'error',
                        errorMessage: `Couldn't start/run the Cursor agent: ${message}`,
                    };
                }
                return {
                    text: '',
                    agentId,
                    status: 'error',
                    errorMessage: `Unexpected agent error: ${message}`,
                };
            } finally {
                try {
                    if (agent && typeof agent[Symbol.asyncDispose] === 'function') {
                        await agent[Symbol.asyncDispose]();
                    } else if (agent && typeof agent.close === 'function') {
                        await agent.close();
                    }
                } catch (disposeErr) {
                    console.error('[agent] dispose error:', disposeErr);
                }
            }
        },
    };
}

export async function buildPrompt(
    client: Client4,
    post: IncomingPost,
    rootId: string,
    channelName?: string,
): Promise<string> {
    let threadContext = '';
    try {
        const thread = await client.getPostThread(rootId);
        const posts = Object.values(thread.posts ?? {})
            .filter((p: any) => p?.id !== post.id)
            .sort((a: any, b: any) => (a.create_at ?? 0) - (b.create_at ?? 0))
            .slice(-12);
        if (posts.length > 0) {
            threadContext =
                '\n\nRecent thread context:\n' +
                posts
                    .map((p: any) => `- [${p.user_id === post.user_id ? 'user' : 'other'}] ${String(p.message).slice(0, 400)}`)
                    .join('\n');
        }
    } catch (err) {
        console.warn('[agent] failed to fetch thread context:', err);
    }

    const question = stripDebugMention(post.message) || post.message;
    const where = channelName ? `Channel: ${channelName}\n` : '';

    return `${READ_ONLY_PREAMBLE}\n${where}User question:\n${question}${threadContext}`;
}

export async function handleAgentTurn(args: {
    runner: AgentRunner;
    config: Config;
    client: Client4;
    threads: ThreadManager;
    progress: ProgressNarrator;
    post: IncomingPost;
    rootId: string;
    channelName?: string;
}): Promise<void> {
    const {runner, config, client, threads, progress, post, rootId, channelName} = args;
    const existingAgentId = threads.getAgentId(rootId);
    const prompt = await buildPrompt(client, post, rootId, channelName);

    const result = await runner.run({
        rootId,
        existingAgentId,
        prompt,
        onEvent: (event) => progress.onStreamEvent(event),
        onStarted: ({agentId, runId}) => progress.postViewLink(agentId, runId),
        timeoutMs: config.agentTimeoutMs,
    });

    if (result.agentId) {
        threads.setAgentId(rootId, result.agentId);
        console.log(`[agent] mapped thread ${rootId} -> agent ${result.agentId}`);
    }

    if (result.status !== 'finished') {
        await threads.postReply(
            post.channel_id,
            rootId,
            `⚠️ ${result.errorMessage ?? 'The agent did not finish successfully.'}`,
        );
        return;
    }

    await threads.postReply(post.channel_id, rootId, result.text);
}
