import { json, withStaff } from "@/lib/api";
import { floorSnapshot } from "@/lib/tables";

export const dynamic = "force-dynamic";

export async function GET() {
  return withStaff(async ({ restaurant }) => json(await floorSnapshot(restaurant)));
}
