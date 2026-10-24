// In-process fan-out for agent run events. The SSE endpoint in server.mjs
// subscribes here; runs publish here. Events are ephemeral by design — the
// durable truth lives in agent_runs / tool_call_logs, so a client that missed
// events recovers state by re-reading those tables.
const MAX_BUFFER = 200

export class AgentEventBus {
  constructor() {
    this.listeners = new Set()
    this.buffer = []
  }

  publish(event) {
    const stamped = { at: new Date().toISOString(), ...event }
    this.buffer.push(stamped)
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER)
    for (const listener of [...this.listeners]) {
      try { listener(stamped) } catch { /* a broken subscriber never breaks a run */ }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  recent() { return [...this.buffer] }
}
