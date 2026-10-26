// Small Socket.IO-like event wrapper using the browser's native WebSocket API.
(() => {
  class MiniSocket {
    constructor() {
      this.handlers = {}; this.queue = []; this.connected = false; this.closedByUser = false;
      this.connect();
    }
    on(event, fn) { (this.handlers[event] ||= []).push(fn); return this; }
    dispatch(event, data) { for (const fn of this.handlers[event] || []) { try { fn(data); } catch (e) { console.error(e); } } }
    emit(event, data = {}) {
      const packet = JSON.stringify({ event, data });
      if (this.connected && this.ws.readyState === WebSocket.OPEN) this.ws.send(packet);
      else this.queue.push(packet);
    }
    connect() {
      const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${scheme}//${location.host}/ws`);
      this.ws.addEventListener('open', () => {
        const wasConnected = this.connected; this.connected = true;
        while (this.queue.length) this.ws.send(this.queue.shift());
        this.dispatch('connect');
      });
      this.ws.addEventListener('message', e => {
        try { const msg = JSON.parse(e.data); this.dispatch(msg.event, msg.data); } catch (err) { console.warn('Invalid game message', err); }
      });
      this.ws.addEventListener('close', () => {
        const hadBeenConnected = this.connected; this.connected = false;
        if (hadBeenConnected) this.dispatch('disconnect');
        if (!this.closedByUser) setTimeout(() => this.connect(), 1500);
      });
      this.ws.addEventListener('error', () => {});
    }
  }
  window.io = () => new MiniSocket();
})();
