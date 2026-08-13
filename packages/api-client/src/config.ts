export interface ApiClientConfig {
  baseUrl: string;
}

let config: ApiClientConfig = {
  baseUrl: "http://localhost:4000/api/v1",
};

export function configureApiClient(next: Partial<ApiClientConfig>): void {
  config = { ...config, ...next };
}

export function getApiClientConfig(): ApiClientConfig {
  return config;
}
