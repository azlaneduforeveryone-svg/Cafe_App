/**
 * Who can do what. One table, used by the server on every request and by the screens
 * to hide what a person can't use. The server check is the one that counts.
 */

export type Role = "owner" | "manager" | "reception" | "waiter";
export const ROLES: Role[] = ["owner", "manager", "reception", "waiter"];
export const INVITABLE: Role[] = ["manager", "reception", "waiter"];

export type Permission =
  | "queue.view" // see the waitlist
  | "queue.manage" // add, notify, seat, no-show
  | "floor.view" // see tables
  | "floor.tables" // open, close, seat at tables
  | "floor.alerts" // answer help / water / bill calls
  | "orders.pre" // accept or cancel waitlist pre-orders
  | "orders.table" // accept or cancel table orders
  | "orders.serve" // mark served
  | "bills.pay" // mark paid, give loyalty rewards
  | "kitchen.view" // kitchen screen
  | "kitchen.act" // mark dishes ready
  | "kitchen.device" // turn a tablet into a locked kitchen display
  | "menu.stock" // sold out / back in stock
  | "menu.edit" // dishes, prices, schedules, stations
  | "tables.manage" // add tables, QR codes, Wi-Fi
  | "settings.manage" // restaurant settings, logo
  | "loyalty.manage" // loyalty settings, rewards
  | "loyalty.members" // member list with phone numbers
  | "trivia.manage"
  | "reports.view" // reports, revenue, CSV
  | "activity.view" // who did what
  | "staff.manage" // invite and remove staff
  | "billing.manage"; // plan, payment, ownership

const ALL: Permission[] = [
  "queue.view", "queue.manage", "floor.view", "floor.tables", "floor.alerts", "orders.pre", "orders.table", "orders.serve",
  "bills.pay", "kitchen.view", "kitchen.act", "kitchen.device", "menu.stock", "menu.edit", "tables.manage", "settings.manage",
  "loyalty.manage", "loyalty.members", "trivia.manage", "reports.view", "activity.view", "staff.manage", "billing.manage",
];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(ALL),
  manager: new Set(ALL.filter((p) => p !== "billing.manage")),
  reception: new Set<Permission>(["queue.view", "queue.manage", "floor.view", "floor.tables", "floor.alerts", "orders.pre", "bills.pay"]),
  waiter: new Set<Permission>(["queue.view", "floor.view", "floor.tables", "floor.alerts", "orders.pre", "orders.table", "orders.serve", "kitchen.view"]),
};

export const can = (role: Role | string | null | undefined, p: Permission) => !!role && (GRANTS[role as Role]?.has(p) ?? false);

/** Owner manages everyone but themselves; a manager manages reception and waiters only. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "manager" && (target === "reception" || target === "waiter");
}

/** Staff seats besides the owner. */
export const seatLimit = (isPro: boolean) => (isPro ? 20 : 2);

/** The first screen each role lands on. */
export function homeFor(role: Role): string {
  return role === "waiter" ? "/dashboard/floor" : "/dashboard";
}
