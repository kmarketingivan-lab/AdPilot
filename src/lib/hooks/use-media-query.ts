"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Breakpoints (aligned with Tailwind defaults)
// ---------------------------------------------------------------------------

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

// ---------------------------------------------------------------------------
// useMediaQuery — generic media-query hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a CSS media query and return whether it matches.
 *
 * @example
 * const isWide = useMediaQuery("(min-width: 1024px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// ---------------------------------------------------------------------------
// useIsMobile
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the viewport is below the `md` breakpoint (768px).
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${breakpoints.md - 1}px)`);
}

// ---------------------------------------------------------------------------
// useBreakpoint — current breakpoint name
// ---------------------------------------------------------------------------

/**
 * Returns the current Tailwind breakpoint name based on viewport width.
 */
export function useBreakpoint(): Breakpoint | "base" {
  const isSm = useMediaQuery(`(min-width: ${breakpoints.sm}px)`);
  const isMd = useMediaQuery(`(min-width: ${breakpoints.md}px)`);
  const isLg = useMediaQuery(`(min-width: ${breakpoints.lg}px)`);
  const isXl = useMediaQuery(`(min-width: ${breakpoints.xl}px)`);
  const is2xl = useMediaQuery(`(min-width: ${breakpoints["2xl"]}px)`);

  if (is2xl) return "2xl";
  if (isXl) return "xl";
  if (isLg) return "lg";
  if (isMd) return "md";
  if (isSm) return "sm";
  return "base";
}

// ---------------------------------------------------------------------------
// useIsMinWidth — breakpoint-based boolean
// ---------------------------------------------------------------------------

/**
 * Returns `true` when viewport is at or above the given breakpoint.
 *
 * @example
 * const isDesktop = useIsMinWidth("lg");
 */
export function useIsMinWidth(bp: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpoints[bp]}px)`);
}
