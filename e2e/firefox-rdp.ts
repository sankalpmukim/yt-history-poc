/**
 * Minimal client for Firefox's Remote Debugging Protocol, used only to
 * install the built extension as a temporary add-on (the same mechanism
 * web-ext and about:debugging use). Playwright drives stock Firefox over
 * WebDriver BiDi but has no extension-install API of its own.
 *
 * Wire format: `<byte length>:<JSON>` packets over TCP.
 */
import { connect, type Socket } from "node:net"

type Packet = Record<string, any>

class RdpClient {
  private buffer = Buffer.alloc(0)
  private waiters: Array<(p: Packet) => void> = []
  private queue: Packet[] = []

  constructor(private socket: Socket) {
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    })
  }

  private drain() {
    for (;;) {
      const colon = this.buffer.indexOf(":")
      if (colon < 0) return
      const len = Number(this.buffer.subarray(0, colon).toString())
      if (this.buffer.length < colon + 1 + len) return
      const packet = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + len).toString())
      this.buffer = this.buffer.subarray(colon + 1 + len)
      const waiter = this.waiters.shift()
      if (waiter) waiter(packet)
      else this.queue.push(packet)
    }
  }

  next(): Promise<Packet> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  /** send a request and wait for the reply from the same actor */
  async request(packet: Packet): Promise<Packet> {
    const body = Buffer.from(JSON.stringify(packet))
    this.socket.write(`${body.length}:`)
    this.socket.write(body)
    for (;;) {
      const reply = await this.next()
      if (reply.from === packet.to) {
        if (reply.error) throw new Error(`${reply.error}: ${reply.message ?? ""}`)
        return reply
      }
    }
  }

  close() {
    this.socket.destroy()
  }
}

async function open(port: number, deadlineMs: number): Promise<RdpClient> {
  const deadline = Date.now() + deadlineMs
  for (;;) {
    try {
      const socket = await new Promise<Socket>((resolve, reject) => {
        const s = connect(port, "127.0.0.1", () => resolve(s))
        s.once("error", reject)
      })
      const client = new RdpClient(socket)
      await client.next() // greeting from root
      return client
    } catch (e) {
      if (Date.now() > deadline) throw e
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

/** Install an unpacked extension directory as a temporary add-on. */
export async function installTemporaryAddon(port: number, addonPath: string): Promise<string> {
  const client = await open(port, 15_000)
  try {
    const root = await client.request({ to: "root", type: "getRoot" })
    const reply = await client.request({
      to: root.addonsActor,
      type: "installTemporaryAddon",
      addonPath
    })
    return reply.addon?.id as string
  } finally {
    client.close()
  }
}

/**
 * Evaluate an async expression inside the first tab whose URL starts with
 * `urlPrefix` and return its JSON-serializable result.
 *
 * Firefox's WebDriver BiDi skips extension contexts (Bug 1755014), so
 * Playwright can't evaluate in moz-extension:// pages; the devtools protocol
 * can.
 */
export async function evaluateInTab<T = unknown>(
  port: number,
  urlPrefix: string,
  expression: string
): Promise<T> {
  const client = await open(port, 15_000)
  try {
    const { tabs } = await client.request({ to: "root", type: "listTabs" })
    const tab = (tabs as Packet[]).find((t) => String(t.url ?? "").startsWith(urlPrefix))
    if (!tab) throw new Error(`no tab at ${urlPrefix} (have: ${(tabs as Packet[]).map((t) => t.url).join(", ")})`)
    const { frame } = await client.request({ to: tab.actor, type: "getTarget" })
    const text = `(async () => JSON.stringify({ value: await (${expression}) }))()`
    const { resultID } = await client.request({
      to: frame.consoleActor,
      type: "evaluateJSAsync",
      text,
      mapped: { await: true }
    })
    for (;;) {
      const packet = await client.next()
      if (packet.type !== "evaluationResult" || packet.resultID !== resultID) continue
      if (packet.hasException) {
        const message = packet.exceptionMessage ?? JSON.stringify(packet.exception)
        throw new Error(`evaluation in ${urlPrefix} failed: ${message}`)
      }
      const value = packet.result
      if (typeof value !== "string") throw new Error(`unexpected result: ${JSON.stringify(value)}`)
      return JSON.parse(value).value as T
    }
  } finally {
    client.close()
  }
}
