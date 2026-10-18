"use client";

// The §1.1 badge on every simulated channel row and header; renders nothing for a live channel.

import { FlaskConical } from "lucide-react";
import { Badge } from "@geiger/ui";
import { CONNECT_DISCLOSURE, isSimulated } from "./constants";

export function SimulatedBadge({ channel, className }) {
  if (!isSimulated(channel)) return null;
  return (
    <Badge variant="warning" className={className} title={CONNECT_DISCLOSURE}>
      <FlaskConical aria-hidden="true" />
      Simulated
    </Badge>
  );
}
