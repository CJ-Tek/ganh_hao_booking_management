"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function FilterChipScroll(props: {
  children: ReactNode;
  /** Pull scroll area to card edges on narrow mobile layouts. */
  edgeBleed?: boolean;
  className?: string;
}) {
  const { children, edgeBleed = false, className } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) {
        return;
      }
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={scrollRef}
      className={[
        "filter-chip-scroll",
        edgeBleed ? "filter-chip-scroll--edge-bleed" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
