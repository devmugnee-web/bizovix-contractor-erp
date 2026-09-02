import { appConfig } from "@/config/app";
import { demoProvider, mockProvider } from "@/services/providers/mock-provider";
import { apiProvider } from "@/services/providers/api-provider";
import type { DataMode } from "@/types/domain";
import type { DataProvider } from "@/types/api";

export function getDataProvider(mode: DataMode): DataProvider {
  if (mode === "demo") {
    return demoProvider;
  }

  if (mode === "api") {
    return apiProvider;
  }

  return mockProvider;
}

export function getDefaultDataMode(): DataMode {
  return appConfig.defaultMode;
}
