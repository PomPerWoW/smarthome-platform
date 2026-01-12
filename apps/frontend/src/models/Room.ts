import type { RoomDTO } from "@/types/home.types";
import type { BaseDevice } from "./devices/BaseDevice";

export class Room {
  readonly id: string;
  readonly name: string;
  readonly homeId: string;
  devices: BaseDevice[] = [];

  constructor(id: string, name: string, homeId: string) {
    this.id = id;
    this.name = name;
    this.homeId = homeId;
  }

  static fromApi(data: RoomDTO): Room {
    return new Room(data.id, data.room_name, data.home);
  }

  get deviceCount(): number {
    return this.devices.length;
  }

  toJSON(): RoomDTO {
    return {
      id: this.id,
      room_name: this.name,
      home: this.homeId,
    };
  }
}
