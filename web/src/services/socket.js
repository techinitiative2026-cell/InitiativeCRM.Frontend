// Simple WebSocket client with automatic reconnect and event subscriptions
// Usage:
// import socket, { getSocket } from '@/services/socket';
// socket.connect();
// socket.subscribe('lead.updated', (payload) => { ... });

const DEFAULT_RECONNECT_DELAY = 1000; // 1s
const MAX_RECONNECT_DELAY = 30000; // 30s

function _getDefaultWsUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${host}/ws`;
  }

  return null;
}

export class SocketClient {
  constructor(url) {
    this.url = url || _getDefaultWsUrl();
    this.ws = null;
    this.subscribers = new Map(); // event -> Set(handler)
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.reconnectAttempts = 0;
    this.manualClose = false;
    this._onOpen = this._onOpen.bind(this);
    this._onMessage = this._onMessage.bind(this);
    this._onClose = this._onClose.bind(this);
    this._onError = this._onError.bind(this);
  }

  connect() {
    if (!this.url) {
      console.warn('SocketClient: no url provided');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('open', this._onOpen);
    this.ws.addEventListener('message', this._onMessage);
    this.ws.addEventListener('close', this._onClose);
    this.ws.addEventListener('error', this._onError);
  }

  _onOpen(ev) {
    this.reconnectAttempts = 0;
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this._emit('open', ev);
  }

  _onMessage(ev) {
    let data = ev.data;
    let parsed;

    try {
      parsed = JSON.parse(data);
    } catch (err) {
      // Non-JSON message -> emit raw
      this._emit('*', data);
      return;
    }

    // Expect messages formatted as { type: string, payload: any }
    const { type, payload } = parsed;
    if (type) this._emit(type, payload, parsed);
    this._emit('*', parsed);
  }

  _onClose(ev) {
    this._emit('close', ev);
    if (!this.manualClose) this._scheduleReconnect();
  }

  _onError(ev) {
    this._emit('error', ev);
  }

  _scheduleReconnect() {
    const delay = Math.min(MAX_RECONNECT_DELAY, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  subscribe(event, handler) {
    if (!this.subscribers.has(event)) this.subscribers.set(event, new Set());
    this.subscribers.get(event).add(handler);

    return () => this.unsubscribe(event, handler);
  }

  unsubscribe(event, handler) {
    const set = this.subscribers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.subscribers.delete(event);
  }

  _emit(event, ...args) {
    const set = this.subscribers.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          handler(...args);
        } catch (err) {
          console.error('Socket handler error for', event, err);
        }
      }
    }
  }

  send(type, payload) {
    const message = JSON.stringify({ type, payload });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      return true;
    }
    console.warn('SocketClient: websocket not open, message not sent', message);
    return false;
  }

  close() {
    this.manualClose = true;
    if (this.ws) {
      this.ws.removeEventListener('open', this._onOpen);
      this.ws.removeEventListener('message', this._onMessage);
      this.ws.removeEventListener('close', this._onClose);
      this.ws.removeEventListener('error', this._onError);
      try { this.ws.close(); } catch(e) {}
      this.ws = null;
    }
  }
}

let _singleton = null;

export function getSocket(url) {
  if (!_singleton) _singleton = new SocketClient(url);
  return _singleton;
}

// default export: singleton instance (lazy created)
const socket = getSocket();
export default socket;
