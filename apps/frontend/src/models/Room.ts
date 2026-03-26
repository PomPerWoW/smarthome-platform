import type { RoomDTO } from "@/types/home.types";
import type { BaseDevice } from "./devices/BaseDevice";

export interface FurnitureItem {
  id: string;
  name: string;
  type: string;
  roomName: string | null;
}

export class Room {
  readonly id: string;
  readonly name: string;
  readonly homeId: string;
  readonly roomModel: string;
  devices: BaseDevice[] = [];
  furniture: FurnitureItem[] = [];

  constructor(id: string, name: string, homeId: string, roomModel: string = "LabPlan") {
    this.id = id;
    this.name = name;
    this.homeId = homeId;
    this.roomModel = roomModel;
  }

  static fromApi(data: RoomDTO): Room {
    return new Room(data.id, data.room_name, data.home, data.room_model ?? "LabPlan");
  }

  get deviceCount(): number {
    return this.devices.length;
  }

  get furnitureCount(): number {
    return this.furniture.length;
  }

  toJSON(): RoomDTO {
    return {
      id: this.id,
      room_name: this.name,
      room_model: this.roomModel,
      home: this.homeId,
    };
  }
}
