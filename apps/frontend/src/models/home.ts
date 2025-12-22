import type { Device } from "./device";

export interface Room {
  id: string;
  name: string;
  modelPath: string;
  devices: Device[];
}

export interface Floor {
  id: string;
  name: string;
  floorNumber: number;
  rooms: Room[];
}

export interface Home {
  id: string;
  name: string;
  address: string;
  floors: Floor[];
}

export const createRoom = (partial: Partial<Room> & { id: string; name: string; modelPath: string }): Room => {
  return {
    id: partial.id,
    name: partial.name,
    modelPath: partial.modelPath,
    devices: partial.devices ?? [],
  };
};

export const createFloor = (partial: Partial<Floor> & { id: string; name: string; floorNumber: number }): Floor => {
  return {
    id: partial.id,
    name: partial.name,
    floorNumber: partial.floorNumber,
    rooms: partial.rooms ?? [],
  };
};

export const createHome = (partial: Partial<Home> & { id: string; name: string }): Home => {
  return {
    id: partial.id,
    name: partial.name,
    address: partial.address ?? "",
    floors: partial.floors ?? [],
  };
};