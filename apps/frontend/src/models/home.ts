import type { Device } from "./device";

export class Room {
  readonly id: string;
  readonly name: string;
  readonly modelPath: string;
  devices: Device[];

  constructor(data: {
    id: string;
    name: string;
    modelPath: string;
    devices?: Device[];
  }) {
    this.id = data.id;
    this.name = data.name;
    this.modelPath = data.modelPath;
    this.devices = data.devices ?? [];
  }

  static fromApi(data: any): Room {
    return new Room({
      id: data.id,
      name: data.name,
      modelPath: data.model_path ?? data.modelPath,
      devices: data.devices ?? [],
    });
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      modelPath: this.modelPath,
      devices: this.devices,
    };
  }

  get deviceCount(): number {
    return this.devices.length;
  }
}

export class Floor {
  readonly id: string;
  readonly name: string;
  readonly floorNumber: number;
  rooms: Room[];

  constructor(data: {
    id: string;
    name: string;
    floorNumber: number;
    rooms?: Room[];
  }) {
    this.id = data.id;
    this.name = data.name;
    this.floorNumber = data.floorNumber;
    this.rooms = data.rooms ?? [];
  }

  static fromApi(data: any): Floor {
    return new Floor({
      id: data.id,
      name: data.name,
      floorNumber: data.floor_number ?? data.floorNumber,
      rooms: data.rooms?.map((room: any) => Room.fromApi(room)) ?? [],
    });
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      floorNumber: this.floorNumber,
      rooms: this.rooms.map(room => room.toJSON()),
    };
  }

  get roomCount(): number {
    return this.rooms.length;
  }

  get totalDeviceCount(): number {
    return this.rooms.reduce((sum, room) => sum + room.deviceCount, 0);
  }
}

export class Home {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  floors: Floor[];

  constructor(data: {
    id: string;
    name: string;
    address?: string;
    floors?: Floor[];
  }) {
    this.id = data.id;
    this.name = data.name;
    this.address = data.address ?? "";
    this.floors = data.floors ?? [];
  }

  static fromApi(data: any): Home {
    return new Home({
      id: data.id,
      name: data.name,
      address: data.address ?? "",
      floors: data.floors?.map((floor: any) => Floor.fromApi(floor)) ?? [],
    });
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      address: this.address,
      floors: this.floors.map(floor => floor.toJSON()),
    };
  }

  get floorCount(): number {
    return this.floors.length;
  }

  get totalRoomCount(): number {
    return this.floors.reduce((sum, floor) => sum + floor.roomCount, 0);
  }

  get totalDeviceCount(): number {
    return this.floors.reduce((sum, floor) => sum + floor.totalDeviceCount, 0);
  }
}