import { fail, json, readBody } from "@/lib/api";
import { entryByViewToken } from "@/lib/queue";
import { ticketScope, triviaAnswer, triviaJoin, triviaSnapshot, triviaStart } from "@/lib/trivia";

type Ctx = { params: Promise<{ viewToken: string }> };

/** Trivia from the party's view-only link. Same game as the ticket; the real ticket key stays on the server. */
async function scopeFor(viewToken: string) {
  const e = await entryByViewToken(viewToken);
  return e ? ticketScope(e.token) : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const sc = await scopeFor((await params).viewToken);
  if (!sc) return fail("not_waiting", 404);
  return json(await triviaSnapshot(sc));
}

export async function POST(req: Request, { params }: Ctx) {
  const sc = await scopeFor((await params).viewToken);
  if (!sc) return fail("not_waiting", 409);
  const b = await readBody(req);
  const res = b.action === "join" ? await triviaJoin(sc, b.nickname) : b.action === "start" ? await triviaStart(sc) : b.action === "answer" ? await triviaAnswer(sc, b) : null;
  if (!res) return fail("bad_action", 400);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
