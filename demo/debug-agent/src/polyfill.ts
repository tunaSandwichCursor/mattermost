/**
 * Node polyfills required before importing @mattermost/client.
 *
 * The client's reconnect paths construct browser-only CloseEvent
 * (webapp/platform/client/src/websocket.ts:319 and :400). Without this
 * polyfill the bridge crashes exactly when the connection degrades.
 */
import {WebSocket as WsWebSocket} from 'ws';

const g = globalThis as typeof globalThis & {
    WebSocket?: typeof WebSocket;
    CloseEvent?: typeof CloseEvent;
};

if (typeof g.WebSocket === 'undefined') {
    g.WebSocket = WsWebSocket as unknown as typeof WebSocket;
}

if (typeof g.CloseEvent === 'undefined') {
    class CloseEventShim extends Event {
        readonly code: number;
        readonly reason: string;
        readonly wasClean: boolean;

        constructor(type: string, eventInitDict: CloseEventInit = {}) {
            super(type, eventInitDict);
            this.code = eventInitDict.code ?? 0;
            this.reason = eventInitDict.reason ?? '';
            this.wasClean = eventInitDict.wasClean ?? false;
        }
    }

    g.CloseEvent = CloseEventShim as typeof CloseEvent;
}
