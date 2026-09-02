import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_DATA_MODE: z.enum(["mock", "demo", "api"]).default("api"),
  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_API_BASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_CLOUD_SYNC_URL: z.string().optional().default(""),
  NEXT_PUBLIC_YOUTUBE_CHANNEL_URL: z.string().optional().default(""),
  NEXT_PUBLIC_DESKTOP_MODE: z.enum(["true", "false"]).default("false"),
});

const parsedEnv = envSchema.parse({
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_CLOUD_SYNC_URL: process.env.NEXT_PUBLIC_CLOUD_SYNC_URL,
  NEXT_PUBLIC_YOUTUBE_CHANNEL_URL: process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_URL,
  NEXT_PUBLIC_DESKTOP_MODE: process.env.NEXT_PUBLIC_DESKTOP_MODE,
});

export const appConfig = {
  appName: "Bizovix ERP",
  companyName: "Bizovix Trading Limited",
  defaultMode: parsedEnv.NEXT_PUBLIC_DATA_MODE,
  demoModeFlag: parsedEnv.NEXT_PUBLIC_DEMO_MODE === "true",
  apiBaseUrl: parsedEnv.NEXT_PUBLIC_API_BASE_URL,
  cloudSyncUrl: parsedEnv.NEXT_PUBLIC_CLOUD_SYNC_URL,
  youtubeChannelUrl: parsedEnv.NEXT_PUBLIC_YOUTUBE_CHANNEL_URL,
  // A single-owner desktop can open its local workspace automatically. As soon
  // as team members exist, the API requires the normal role-aware sign-in flow.
  desktopMode: parsedEnv.NEXT_PUBLIC_DESKTOP_MODE === "true",
  fiscalYearLabel: "FY 2024-25",
};
