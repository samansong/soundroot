import { route } from "@/server/api";
import { createProject, listProjects } from "@/server/modules/projects";

export const GET = route(({ actor }) => listProjects(actor));
export const POST = route(async ({ actor, json }) => createProject(actor, await json()));
