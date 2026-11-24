import { fail, json, readBody } from "@/lib/api";
import { tableScope, triviaAnswer, triviaJoin, triviaSnapshot, triviaStart } from "@/lib/trivia";

type Ctx = { params: Promise<{ tableId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const sc = await tableScope(tableId);
  if (!sc) return fail("table_closed", 404);
  return json(await triviaSnapshot(sc));
}

/** { action: "join", nickname } | { action: "start" } | { action: "answer", gameId, index, choice } */
export async function POST(req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const sc = await tableScope(tableId);
  if (!sc) return fail("table_closed", 409);
  const b = await readBody(req);
  const res = b.action === "join" ? await triviaJoin(sc, b.nickname) : b.action === "start" ? await triviaStart(sc) : b.action === "answer" ? await triviaAnswer(sc, b) : null;
  if (!res) return fail("bad_action", 400);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
