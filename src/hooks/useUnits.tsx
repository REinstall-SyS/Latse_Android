import React, { createContext, useContext } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { defaultUnits, type UnitSystem } from "@/domain/units";
const UnitsContext = createContext<{
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
}>({ units: "metric", setUnits: () => {} });
export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [stored, setUnits] = useLocalStorage<UnitSystem>(
    "latse_units_v1",
    defaultUnits(),
  );
  const units =
    stored === "imperial" || stored === "metric" ? stored : defaultUnits();
  return (
    <UnitsContext.Provider value={{ units, setUnits }}>
      {children}
    </UnitsContext.Provider>
  );
}
export const useUnits = () => useContext(UnitsContext);
export function UnitToggle() {
  const { units, setUnits } = useUnits();
  return (
    <div
      className="unit-toggle"
      role="group"
      aria-label="Distance and elevation units"
    >
      {(
        [
          ["imperial", "MI / FT"],
          ["metric", "KM / M"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          aria-pressed={units === value}
          onClick={() => setUnits(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
