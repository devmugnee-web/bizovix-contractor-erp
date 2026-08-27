"use client";

// Tender Costing has no backend (see mock-data.ts), but the List page and the
// Add New Costing page are separate routes/components — a plain useState on
// the List page can't receive a row created on the Add page across a
// navigation. React Query's cache is already the app's shared client state
// layer, so it doubles as the mock store here instead of introducing a new
// state-management pattern for one feature.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TENDER_COSTING_ROWS, type TenderCostingRow } from "./mock-data";

const COSTING_ROWS_QUERY_KEY = ["tender-costing", "rows"] as const;

export function useCostingRows(): TenderCostingRow[] {
  const { data } = useQuery({
    queryKey: COSTING_ROWS_QUERY_KEY,
    queryFn: () => TENDER_COSTING_ROWS,
    staleTime: Infinity,
  });
  return data ?? TENDER_COSTING_ROWS;
}

export function useCostingRowById(id: string | undefined): TenderCostingRow | undefined {
  const rows = useCostingRows();
  return id ? rows.find((row) => row.id === id) : undefined;
}

export function useAddCostingRow() {
  const queryClient = useQueryClient();
  return (row: TenderCostingRow) => {
    queryClient.setQueryData<TenderCostingRow[]>(COSTING_ROWS_QUERY_KEY, (current) => [
      row,
      ...(current ?? TENDER_COSTING_ROWS),
    ]);
  };
}
