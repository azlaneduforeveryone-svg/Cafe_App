import { fail, json, readBody } from "@/lib/api";
import { ticketScope, triviaAnswer, triviaJoin, triviaSnapshot, triviaStart } from "@/lib/trivia";

type Ctx = { params: Promise<{ token: string }> };

/** Trivia for a party still waiting for a table; the ticket link is the proof of membership. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const sc = await ticketScope(token);
  if (!sc) return fail("not_waiting", 404);
  return json(await triviaSnapshot(sc));
}

/** { action: "join", nickname } | { action: "start" } | { action: "answer", gameId, index, choice } */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const sc = await ticketScope(token);
  if (!sc) return fail("not_waiting", 409);
  const b = await readBody(req);
  const res = b.action === "join" ? await triviaJoin(sc, b.nickname) : b.action === "start" ? await triviaStart(sc) : b.action === "answer" ? await triviaAnswer(sc, b) : null;
  if (!res) return fail("bad_action", 400);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
