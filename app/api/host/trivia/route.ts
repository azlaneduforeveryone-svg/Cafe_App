import { fail, json, readBody, withStaff } from "@/lib/api";
import { deleteHouseQuestion, listHouseQuestions, saveHouseQuestion, setTriviaOn } from "@/lib/trivia";

export async function GET() {
  return withStaff("trivia.manage", async ({ restaurant }) => json({ questions: await listHouseQuestions(restaurant.id) }));
}

/** { on: boolean } toggles trivia; otherwise creates / updates ({ id }) one of the restaurant's own questions. */
export async function POST(req: Request) {
  return withStaff("trivia.manage", async ({ restaurant }) => {
    const b = await readBody(req);
    if (typeof b.on === "boolean") {
      const res = await setTriviaOn(restaurant, b.on);
      return res.ok ? json({ ok: true }) : fail(res.error, res.status);
    }
    const res = await saveHouseQuestion(restaurant, b);
    return res.ok ? json({ ok: true, id: res.value.id }) : fail(res.error, res.status);
  });
}

export async function DELETE(req: Request) {
  return withStaff("trivia.manage", async ({ restaurant }) => {
    const res = await deleteHouseQuestion(restaurant, new URL(req.url).searchParams.get("id") ?? "");
    return res.ok ? json({ ok: true }) : fail(res.error, res.status);
  });
}
