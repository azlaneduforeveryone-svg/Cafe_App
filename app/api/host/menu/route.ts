import { withStaff } from "@/lib/api";
import { getMenu } from "@/lib/menu";

export const dynamic = "force-dynamic";

/** Full menu for the editor, including hidden dishes. */
export async function GET() {
  return withStaff(["menu.edit", "menu.stock"], async ({ restaurant }) =>
    Response.json(await getMenu(restaurant, { includeHidden: true }), { headers: { "Cache-Control": "no-store" } }),
  );
}
