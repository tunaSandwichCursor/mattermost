/**
 * Lightweight unit checks for mention trigger logic (no Mattermost required).
 * Run: npx tsx src/mention.test.ts
 */
import {decideMention, stripDebugMention} from './mention.js';

function assert(cond: boolean, msg: string) {
    if (!cond) {
        throw new Error(msg);
    }
}

const botId = 'bot-user-id';

function postEvent(overrides: {
    message: string;
    mentions?: string[];
    channel_type?: string;
    user_id?: string;
}) {
    return {
        post: JSON.stringify({
            id: 'post1',
            user_id: overrides.user_id ?? 'user1',
            channel_id: 'chan1',
            root_id: '',
            message: overrides.message,
        }),
        mentions: overrides.mentions ? JSON.stringify(overrides.mentions) : undefined,
        channel_type: overrides.channel_type ?? 'O',
    };
}

// Happy path
{
    const d = decideMention(postEvent({message: '@debug why?', mentions: [botId]}), botId);
    assert(d.shouldHandle === true, 'expected handle on @debug + mentions');
}

// @channel must NOT trigger even if bot is in mentions
{
    const d = decideMention(postEvent({message: '@channel heads up', mentions: [botId]}), botId);
    assert(d.shouldHandle === false, 'expected reject on @channel');
}

// Self-post guard
{
    const d = decideMention(
        postEvent({message: '@debug hi', mentions: [botId], user_id: botId}),
        botId,
    );
    assert(d.shouldHandle === false, 'expected reject self post');
}

// DM without @debug still triggers
{
    const d = decideMention(
        postEvent({message: 'hello there', channel_type: 'D'}),
        botId,
    );
    assert(d.shouldHandle === true && d.isDm === true, 'expected DM trigger');
}

// Text match without being in mentions → reject (bot not in channel)
{
    const d = decideMention(postEvent({message: '@debug help'}), botId);
    assert(d.shouldHandle === false, 'expected reject when not in mentions');
}

assert(stripDebugMention('@debug what now?') === 'what now?', 'strip mention');

console.log('mention.test.ts PASSED');
