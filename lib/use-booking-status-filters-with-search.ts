"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import {
  bookingSearchStatusFilters,
  bookingStatusFiltersEqual,
  defaultBookingStatusFilters,
  normalizeBookingStatusFilters,
} from "@/lib/display";
import { type BookingStatus } from "@/lib/types";

type UseBookingStatusFiltersWithSearchOptions = {
  searchStatusFilters?: readonly BookingStatus[];
  defaultStatusFilters?: readonly BookingStatus[];
};

export function useBookingStatusFiltersWithSearch(
  searchQuery: string,
  statusFilters: readonly BookingStatus[],
  setStatusFilters: Dispatch<SetStateAction<BookingStatus[]>>,
  options?: UseBookingStatusFiltersWithSearchOptions
): boolean {
  const activeSearchFilters = options?.searchStatusFilters ?? bookingSearchStatusFilters;
  const fallbackFilters = options?.defaultStatusFilters ?? defaultBookingStatusFilters;
  const savedFiltersRef = useRef<BookingStatus[] | null>(null);
  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    if (isSearching) {
      if (savedFiltersRef.current === null) {
        savedFiltersRef.current = bookingStatusFiltersEqual(statusFilters, activeSearchFilters)
          ? [...fallbackFilters]
          : [...statusFilters];
      }
      if (!bookingStatusFiltersEqual(statusFilters, activeSearchFilters)) {
        setStatusFilters([...activeSearchFilters]);
      }
      return;
    }

    if (savedFiltersRef.current !== null) {
      const restored = savedFiltersRef.current;
      savedFiltersRef.current = null;
      setStatusFilters(normalizeBookingStatusFilters(restored));
    }
  }, [activeSearchFilters, fallbackFilters, isSearching, searchQuery, setStatusFilters, statusFilters]);

  return isSearching;
}
