import rosterData from "./roster-data.json";

export const ROSTER = rosterData;

export const CAR_BY_ID = new Map(ROSTER.map((c) => [c.id, c]));

export function carsForLine(lineKey) {
  return ROSTER.filter((c) => c.line === lineKey);
}

export function getCar(carId) {
  return CAR_BY_ID.get(carId) || null;
}
