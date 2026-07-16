import type { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;

export function registerModelQueryClient(queryClient: QueryClient): void {
  client = queryClient;
}

export function invalidateModelQueries(): Promise<void> {
  if (!client) return Promise.resolve();
  return client.invalidateQueries({ queryKey: ["models"] });
}

