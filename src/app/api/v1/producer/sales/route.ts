import { route } from "@/server/api";
import { producerSales } from "@/server/modules/billing";

export const GET = route(({ actor }) => producerSales(actor));
