import { apiRequest } from "@/services/api-client";
import type {
  ApproveManufacturingSupplySuggestionInput,
  CancelManufacturingSupplySuggestionInput,
  ConvertManufacturingSupplySuggestionInput,
  CreateManufacturingSupplySuggestionInput,
  ManufacturingSupplySuggestionListQuery,
  ManufacturingSupplySuggestionMutationResult,
  ManufacturingSupplySuggestionRecord,
} from "@/types/manufacturing-supply";

export function buildManufacturingSupplySuggestionListPath(
  path: string,
  values: ManufacturingSupplySuggestionListQuery,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

function post<T>(path: string, body: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listManufacturingSupplySuggestions(
  input: ManufacturingSupplySuggestionListQuery,
) {
  return apiRequest<ManufacturingSupplySuggestionRecord[]>(
    buildManufacturingSupplySuggestionListPath(
      "/manufacturing/supply-suggestions",
      input,
    ),
  );
}

export function createManufacturingSupplySuggestion(
  input: CreateManufacturingSupplySuggestionInput,
) {
  return post<ManufacturingSupplySuggestionMutationResult>(
    "/manufacturing/supply-suggestions",
    input,
  );
}

export function approveManufacturingSupplySuggestion(
  suggestionId: string,
  input: ApproveManufacturingSupplySuggestionInput,
) {
  return post<ManufacturingSupplySuggestionMutationResult>(
    `/manufacturing/supply-suggestions/${encodeURIComponent(suggestionId)}/approve`,
    input,
  );
}

export function convertManufacturingSupplySuggestion(
  suggestionId: string,
  input: ConvertManufacturingSupplySuggestionInput,
) {
  return post<ManufacturingSupplySuggestionMutationResult>(
    `/manufacturing/supply-suggestions/${encodeURIComponent(suggestionId)}/convert`,
    input,
  );
}

export function cancelManufacturingSupplySuggestion(
  suggestionId: string,
  input: CancelManufacturingSupplySuggestionInput,
) {
  return post<ManufacturingSupplySuggestionMutationResult>(
    `/manufacturing/supply-suggestions/${encodeURIComponent(suggestionId)}/cancel`,
    input,
  );
}
