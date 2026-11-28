/** Unknown API addresses answer in JSON (404), not with the HTML "page not found" screen. */
const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
