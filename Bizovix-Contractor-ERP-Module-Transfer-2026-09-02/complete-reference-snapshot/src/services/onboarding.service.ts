import { apiRequest } from "@/services/api-client";
import type { AppAuthSession, OnboardingState } from "@/types/api";

export function getOnboardingState() {
  return apiRequest<OnboardingState>("/onboarding/state");
}

export function selectBusinessCategory(businessCategoryCode: string) {
  return apiRequest<AppAuthSession>("/onboarding/business-category", {
    method: "POST",
    body: JSON.stringify({ businessCategoryCode }),
  });
}
