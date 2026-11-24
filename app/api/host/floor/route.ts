import { json, withStaff } from "@/lib/api";
import { floorSnapshot } from "@/lib/tables";

export const dynamic = "force-dynamic";

export async function GET() {
  return withStaff("floor.view", async ({ staff, restaurant }) => json(await floorSnapshot(restaurant, { userId: staff.userId, role: staff.role })));
}
