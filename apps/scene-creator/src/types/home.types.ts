import { Device } from "./device.types";

export interface Room {
  id: string;
  name: string;
  devices: Device[];
}

export interface Floor {
  id: string;
  name: string;
  number: number;
  rooms: Room[];
}

export interface Home {
  id: string;
  name: string;
  floors: Floor[];
}
