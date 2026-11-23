import { json, withStaff } from "@/lib/api";
import { kitchenSnapshot } from "@/lib/menu";

export const dynamic = "force-dynamic";

export async function GET() {
  return withStaff(async ({ restaurant }) => json(await kitchenSnapshot(restaurant)));
}
