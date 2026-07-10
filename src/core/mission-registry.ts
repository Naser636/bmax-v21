import { Mission } from "@/contracts/mission";

const missions: Mission[] = [];

export function addMission(mission: Mission): void {
  missions.push(mission);
}

export function getMissions(): readonly Mission[] {
  return missions;
}
