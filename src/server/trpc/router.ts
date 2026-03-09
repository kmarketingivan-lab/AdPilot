import { router } from "./init";
import { workspaceRouter } from "./routers/workspace";
import { socialRouter } from "./routers/social";
import { postRouter } from "./routers/post";
import { mediaRouter } from "./routers/media";
import { scheduleRouter } from "./routers/schedule";
import { analyticsRouter } from "./routers/analytics";
import { dashboardRouter } from "./routers/dashboard";
import { reportsRouter } from "./routers/reports";
import { adsRouter } from "./routers/ads";
import { abtestRouter } from "./routers/abtest";
import { crmRouter } from "./routers/crm";
import { pipelineRouter } from "./routers/pipeline";
import { emailRouter } from "./routers/email";
import { heatmapRouter } from "./routers/heatmap";
import { billingRouter } from "./routers/billing";
import { settingsRouter } from "./routers/settings";
import { notificationsRouter } from "./routers/notifications";
import { onboardingRouter } from "./routers/onboarding";
import { overviewRouter } from "./routers/overview";
import { integrationsRouter } from "./routers/integrations";

export const appRouter = router({
  workspace: workspaceRouter,
  social: socialRouter,
  post: postRouter,
  media: mediaRouter,
  schedule: scheduleRouter,
  analytics: analyticsRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
  ads: adsRouter,
  abtest: abtestRouter,
  crm: crmRouter,
  pipeline: pipelineRouter,
  email: emailRouter,
  heatmap: heatmapRouter,
  billing: billingRouter,
  settings: settingsRouter,
  notifications: notificationsRouter,
  onboarding: onboardingRouter,
  overview: overviewRouter,
  integrations: integrationsRouter,
});

export type AppRouter = typeof appRouter;
