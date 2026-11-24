import { fail, json, readBody } from "@/lib/api";
import { triviaAnswer, triviaJoin, triviaSnapshot, triviaStart } from "@/lib/trivia";

type Ctx = { params: Promise<{ tableId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const snap = await triviaSnapshot(tableId);
  if (!snap) return fail("table_closed", 404);
  return json(snap);
}

/** { action: "join", nickname } | { action: "start" } | { action: "answer", gameId, index, choice } */
export async function POST(req: Request, { params }: Ctx) {
  const { tableId } = await params;
  const b = await readBody(req);
  const res =
    b.action === "join" ? await triviaJoin(tableId, b.nickname) : b.action === "start" ? await triviaStart(tableId) : b.action === "answer" ? await triviaAnswer(tableId, b) : null;
  if (!res) return fail("bad_action", 400);
  return res.ok ? json({ ok: true }) : fail(res.error, res.status);
}
