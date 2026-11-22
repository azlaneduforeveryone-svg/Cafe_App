import { fail, withStaff } from "@/lib/api";
import { buildReport, dailyCSV, dishesCSV, parseRange } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** GET ?type=daily|dishes&from=YYYY-MM-DD&to=YYYY-MM-DD  ->  CSV download */
export async function GET(req: Request) {
  return withStaff(async ({ restaurant }) => {
    const q = Object.fromEntries(new URL(req.url).searchParams);
    const type = q.type === "dishes" ? "dishes" : q.type === "daily" ? "daily" : null;
    if (!type) return fail("invalid", 400);
    const range = parseRange(restaurant.country, { ...q, range: "custom" });
    const rep = await buildReport(restaurant, range);
    const body = type === "daily" ? dailyCSV(rep) : dishesCSV(rep);
    const name = `tablepulse-${restaurant.slug}-${type}-${range.from}_to_${range.to}.csv`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
