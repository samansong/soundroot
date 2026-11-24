import { route } from "@/server/api";
import { markNotificationsRead, notifications } from "@/server/modules/identity";

export const GET = route(({ actor }) => notifications(actor));
export const POST = route(({ actor }) => markNotificationsRead(actor));
