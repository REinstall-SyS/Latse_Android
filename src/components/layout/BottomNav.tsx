import React from "react";
import { CircleDot, Compass, Frame, Map } from "lucide-react";
import type { ViewId } from "@/types/trek.types";

export function BottomNav({
  activeView,
  onNavigate,
  recording = false,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  recording?: boolean;
}) {
  const items = [
    { id: "explore", label: "Trails", Icon: Compass },
    { id: "map", label: "Map", Icon: Map },
    { id: "record", label: "Record", Icon: CircleDot },
    { id: "studio", label: "Studio", Icon: Frame },
  ] as const;
  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item ${activeView === id ? "selected" : ""}`}
          aria-current={activeView === id ? "page" : undefined}
          aria-label={label}
          onClick={() => onNavigate(id)}
        >
          <Icon size={20} />
          <span>{label}</span>
          {id === "record" && recording && <i className="nav-record-dot" />}
        </button>
      ))}
    </nav>
  );
}
