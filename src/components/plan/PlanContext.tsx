"use client";
import { createContext, useContext } from "react";
import type { PlanAccess } from "@/lib/plan";

const PlanContext = createContext<PlanAccess | null>(null);

export function PlanProvider({
  value,
  children,
}: {
  value: PlanAccess;
  children: React.ReactNode;
}) {
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanAccess {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside PlanProvider");
  return ctx;
}
