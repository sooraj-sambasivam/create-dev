import type { AddressInfo } from "node:net";
import type { Express } from "express";

/** Test helper: POST JSON to an app on an ephemeral port. */
export async function postJson(app: Express, path: string, body: unknown): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}
