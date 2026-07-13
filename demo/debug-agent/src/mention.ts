export type IncomingPost = {
    id: string;
    user_id: string;
    channel_id: string;
    root_id: string;
    message: string;
    create_at?: number;
};

export type PostedEventData = {
    post?: string;
    mentions?: string;
    channel_type?: string;
    channel_name?: string;
    channel_display_name?: string;
    team_id?: string;
    sender_name?: string;
};

const DEBUG_MENTION_RE = /@debug\b/i;

function parseMentions(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function parsePost(raw: unknown): IncomingPost | null {
    if (typeof raw !== 'string' || !raw) {
        return null;
    }
    try {
        const post = JSON.parse(raw) as IncomingPost;
        if (!post?.id || !post.user_id || !post.channel_id || typeof post.message !== 'string') {
            return null;
        }
        return post;
    } catch {
        return null;
    }
}

export type MentionDecision =
    | {shouldHandle: false; reason: string}
    | {
        shouldHandle: true;
        post: IncomingPost;
        rootId: string;
        isDm: boolean;
    };

/**
 * Decide whether a `posted` websocket event should launch the debug agent.
 *
 * Load-bearing: require an explicit `@debug` text match. `data.mentions`
 * alone also fires for bots on `@channel`/`@all`/`@here` because bots get
 * default channel-mention notify props (mention_keywords.go:71-84).
 */
export function decideMention(
    data: PostedEventData,
    botUserId: string,
): MentionDecision {
    const post = parsePost(data.post);
    if (!post) {
        return {shouldHandle: false, reason: 'unparseable_post'};
    }

    if (post.user_id === botUserId) {
        return {shouldHandle: false, reason: 'self_post'};
    }

    const isDm = data.channel_type === 'D';
    const mentions = parseMentions(data.mentions);
    const mentioned = mentions.includes(botUserId);
    const hasDebugText = DEBUG_MENTION_RE.test(post.message);

    // DMs with the bot: any message triggers (plan Phase 2).
    if (isDm) {
        return {
            shouldHandle: true,
            post,
            rootId: post.root_id || post.id,
            isDm: true,
        };
    }

    if (!hasDebugText) {
        return {shouldHandle: false, reason: 'no_debug_mention_text'};
    }

    if (!mentioned) {
        // Bot not a channel member → mention won't resolve; still ignore.
        return {shouldHandle: false, reason: 'not_in_mentions'};
    }

    return {
        shouldHandle: true,
        post,
        rootId: post.root_id || post.id,
        isDm: false,
    };
}

/** Strip the @debug mention token from the user message for cleaner prompts. */
export function stripDebugMention(message: string): string {
    return message.replace(DEBUG_MENTION_RE, '').replace(/\s+/g, ' ').trim();
}
