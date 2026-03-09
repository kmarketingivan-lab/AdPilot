import { router } from "./init";
import { workspaceRouter } from "./routers/workspace";

export const appRouter = router({
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
