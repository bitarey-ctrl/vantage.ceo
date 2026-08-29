"use client";

import { useParams } from "next/navigation";
import DecisionsWorkspace from "@/components/decisions/DecisionsWorkspace";

export default function DecisionDetailPage() {
  const params = useParams<{ id: string }>();
  return <DecisionsWorkspace initialSelectedId={params.id} />;
}
