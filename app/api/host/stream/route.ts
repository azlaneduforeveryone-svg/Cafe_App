import { withStaff } from "@/lib/api";
import { sseResponse } from "@/lib/events";
import { hostSnapshot } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withStaff(({ restaurant }) => sseResponse(req, restaurant.id, () => hostSnapshot(restaurant)));
}
