import type { Device } from "./device";

export interface Room {
  id: string;
  name: string;
  model_path: string;
  devices: Device[];
}

export interface Floor {
  id: string;
  name: string;
  floor_number: number;
  rooms: Room[];
}

export interface Home {
  id: string;
  name: string;
  address: string;
  floors: Floor[];
}

export const create_room = (
  partial: Partial<Room> & { id: string; name: string; model_path: string }
): Room => {
  return {
    id: partial.id,
    name: partial.name,
    model_path: partial.model_path,
    devices: partial.devices ?? [],
  };
};

export const create_floor = (
  partial: Partial<Floor> & { id: string; name: string; floor_number: number }
): Floor => {
  return {
    id: partial.id,
    name: partial.name,
    floor_number: partial.floor_number,
    rooms: partial.rooms ?? [],
  };
};

export const create_home = (
  partial: Partial<Home> & { id: string; name: string }
): Home => {
  return {
    id: partial.id,
    name: partial.name,
    address: partial.address ?? "",
    floors: partial.floors ?? [],
  };
};