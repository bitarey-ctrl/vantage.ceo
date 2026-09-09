"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Renders children into document.body, outside the dashboard shell.
 *
 * Why this exists: layered-shell.css gives .vx-workbench `position: relative;
 * z-index: 2`, which makes it a stacking context. Any `fixed inset-0 z-50`
 * overlay rendered inside a page therefore has its z-index scoped to that
 * context — so the CommandBar, a z-[5] sibling of .vx-workbench, painted on
 * top of it. In the New Decision modal that covered the Cancel / Create
 * footer exactly, which is why creating a decision looked broken: the form
 * submitted fine, the button just could not be clicked.
 *
 * Portalling to body takes the overlay out of that stacking context, so its
 * own z-index competes at the top level and wins.
 */
export function ShellPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
