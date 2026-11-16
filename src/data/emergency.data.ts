export interface EmergencyContact {
  region: string;
  number: string;
  description: string;
}

export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    region: "North America",
    number: "911",
    description: "Police · fire · ambulance",
  },
  {
    region: "Europe / GSM",
    number: "112",
    description: "Europe; mobile support varies elsewhere",
  },
  {
    region: "United Kingdom",
    number: "999",
    description: "Police · fire · ambulance · mountain rescue",
  },
  {
    region: "Australia",
    number: "000",
    description: "Police · fire · ambulance",
  },
];

/** Offline regional suggestion, not a country-boundary or network-coverage lookup. */
export function suggestEmergencyContact(
  lat: number,
  lng: number,
): EmergencyContact {
  if (lat >= -44 && lat <= -10 && lng >= 112 && lng <= 154)
    return EMERGENCY_CONTACTS[3];
  if (
    insideGreatBritain(lat, lng) ||
    (lat >= 54 && lat <= 55.4 && lng >= -8.2 && lng <= -5.8)
  )
    return EMERGENCY_CONTACTS[2];
  if (lat >= 15 && lat <= 84 && lng >= -170 && lng <= -50)
    return EMERGENCY_CONTACTS[0];
  return EMERGENCY_CONTACTS[1];
}

function insideGreatBritain(lat: number, lng: number): boolean {
  const coast = [
    [-5.8, 50],
    [-5.1, 49.9],
    [-3.6, 50.2],
    [-2, 50.5],
    [0.2, 50.7],
    [1.5, 51.1],
    [1.8, 52.5],
    [0.4, 53.1],
    [0, 54],
    [-1.2, 55],
    [-1.9, 55.9],
    [-2, 56.7],
    [-1.7, 57.6],
    [-3, 58.7],
    [-4.9, 58.7],
    [-6.5, 57.4],
    [-6, 56.1],
    [-4.7, 54.5],
    [-5.6, 51.7],
  ];
  let inside = false;
  for (
    let index = 0, previous = coast.length - 1;
    index < coast.length;
    previous = index++
  ) {
    const [x, y] = coast[index];
    const [px, py] = coast[previous];
    if (y > lat !== py > lat && lng < ((px - x) * (lat - y)) / (py - y) + x)
      inside = !inside;
  }
  return inside;
}
