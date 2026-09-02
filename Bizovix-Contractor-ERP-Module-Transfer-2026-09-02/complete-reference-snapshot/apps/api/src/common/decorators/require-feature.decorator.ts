import { SetMetadata } from "@nestjs/common";

export const REQUIRED_FEATURES_KEY = "required_features";

export const RequireFeature = (...features: string[]) => SetMetadata(REQUIRED_FEATURES_KEY, features);
