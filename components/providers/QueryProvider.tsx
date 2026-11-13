"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30, // 30 seconds
            refetchOnWindowFocus: false,
            // The library default is 3 retries on a 1s/2s/4s schedule, so every citizen's browser retried in
            // lockstep during an outage. Two retries with a random extra delay spread the load out.
            retry: 2,
            retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000) + Math.floor(Math.random() * 1000),
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
