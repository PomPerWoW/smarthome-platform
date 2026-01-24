import type { HomeDTO } from "@/types/home.types";
import type { Room } from "./Room";

export class Home {
  readonly id: string;
  readonly name: string;
  readonly userId: number;
  rooms: Room[] = [];

  constructor(id: string, name: string, userId: number) {
    this.id = id;
    this.name = name;
    this.userId = userId;
  }

  static fromApi(data: HomeDTO): Home {
    return new Home(data.id, data.home_name, data.user);
  }

  get roomCount(): number {
    return this.rooms.length;
  }

  get deviceCount(): number {
    return this.rooms.reduce((total, room) => total + room.deviceCount, 0);
  }

  toJSON(): HomeDTO {
    return {
      id: this.id,
      home_name: this.name,
      user: this.userId,
    };
  }
}
