export const DeviceType = {
  LIGHTBULB: "lightbulb",
  TELEVISION: "television",
  AIR_CONDITIONER: "air_conditioner",
  FAN: "fan",
} as const;

export type DeviceType = typeof DeviceType[keyof typeof DeviceType];

export class Device {
  readonly id: string;
  readonly name: string;
  readonly type: DeviceType;
  power: boolean;
  x: number;
  y: number;
  z: number;
  scale: number;
  modelPath: string;
  icon: string;
  typeLabel: string;
  colour: string;
  brightness: number;
  volume: number;
  channel: number;
  temperature: number;
  speed: number;
  floorId?: string | null;
  floorName?: string | null;
  roomId?: string | null;
  roomName?: string | null;

  constructor(data: {
    id: string;
    name: string;
    type: DeviceType;
    power?: boolean;
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    modelPath?: string;
    icon?: string;
    typeLabel?: string;
    colour?: string;
    brightness?: number;
    volume?: number;
    channel?: number;
    temperature?: number;
    speed?: number;
    floorId?: string | null;
    floorName?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.power = data.power ?? false;
    this.x = data.x ?? 0.0;
    this.y = data.y ?? 0.0;
    this.z = data.z ?? 0.0;
    this.scale = data.scale ?? 1.0;
    this.modelPath = data.modelPath || this.getDefaultModelPath(data.type);
    this.icon = data.icon ?? "circle";
    this.typeLabel = data.typeLabel ?? "Device";
    this.colour = data.colour ?? "#ffffff";
    this.brightness = data.brightness ?? 0;
    this.volume = data.volume ?? 0;
    this.channel = data.channel ?? 0;
    this.temperature = data.temperature ?? 0.0;
    this.speed = data.speed ?? 0;
    this.floorId = data.floorId ?? null;
    this.floorName = data.floorName ?? null;
    this.roomId = data.roomId ?? null;
    this.roomName = data.roomName ?? null;
  }

  private getDefaultModelPath(type: DeviceType): string {
    return `/models/${type}/scene.gltf`;
  }

  get position(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  static fromApi(data: any): Device {
    return new Device({
      id: data.id,
      name: data.name,
      type: data.type,
      power: data.is_on ?? data.power,
      x: data.position?.[0] ?? data.x ?? 0.0,
      y: data.position?.[1] ?? data.y ?? 1.5,
      z: data.position?.[2] ?? data.z ?? 0.0,
      scale: data.scale,
      modelPath: data.model_path ?? data.modelPath,
      icon: data.icon,
      typeLabel: data.type_label ?? data.typeLabel,
      colour: data.colour,
      brightness: data.brightness,
      volume: data.volume,
      channel: data.channel,
      temperature: data.temperature,
      speed: data.speed,
      floorId: data.floor_id ?? data.floorId,
      floorName: data.floor_name ?? data.floorName,
      roomId: data.room_id ?? data.roomId,
      roomName: data.room_name ?? data.roomName,
    });
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      power: this.power,
      x: this.x,
      y: this.y,
      z: this.z,
      scale: this.scale,
      modelPath: this.modelPath,
      icon: this.icon,
      typeLabel: this.typeLabel,
      colour: this.colour,
      brightness: this.brightness,
      volume: this.volume,
      channel: this.channel,
      temperature: this.temperature,
      speed: this.speed,
      floorId: this.floorId,
      floorName: this.floorName,
      roomId: this.roomId,
      roomName: this.roomName,
    };
  }
}

export class Lightbulb extends Device {
  constructor(data: {
    id: string;
    name: string;
    brightness?: number;
    colour?: string;
    power?: boolean;
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    modelPath?: string;
    floorId?: string | null;
    floorName?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }) {
    super({
      ...data,
      type: DeviceType.LIGHTBULB,
      icon: "lightbulb",
      typeLabel: "Light Bulb",
      brightness: data.brightness ?? 0,
      colour: data.colour ?? "#ffffff",
    });
  }

  static fromApi(data: any): Lightbulb {
    return new Lightbulb({
      id: data.id,
      name: data.name,
      brightness: data.brightness ?? 0,
      colour: data.colour ?? "#ffffff",
      power: data.is_on ?? data.power,
      x: data.position?.[0] ?? data.x ?? 0.0,
      y: data.position?.[1] ?? data.y ?? 1.5,
      z: data.position?.[2] ?? data.z ?? 0.0,
      scale: data.scale,
      modelPath: data.model_path ?? data.modelPath,
      floorId: data.floor_id ?? data.floorId,
      floorName: data.floor_name ?? data.floorName,
      roomId: data.room_id ?? data.roomId,
      roomName: data.room_name ?? data.roomName,
    });
  }
}

export class Television extends Device {
  constructor(data: {
    id: string;
    name: string;
    volume?: number;
    channel?: number;
    power?: boolean;
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    modelPath?: string;
    floorId?: string | null;
    floorName?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }) {
    super({
      ...data,
      type: DeviceType.TELEVISION,
      icon: "tv",
      typeLabel: "Smart TV",
      volume: data.volume ?? 10,
      channel: data.channel ?? 1,
    });
  }

  static fromApi(data: any): Television {
    return new Television({
      id: data.id,
      name: data.name,
      volume: data.volume ?? 10,
      channel: data.channel ?? 1,
      power: data.is_on ?? data.power,
      x: data.position?.[0] ?? data.x ?? 0.0,
      y: data.position?.[1] ?? data.y ?? 1.5,
      z: data.position?.[2] ?? data.z ?? 0.0,
      scale: data.scale,
      modelPath: data.model_path ?? data.modelPath,
      floorId: data.floor_id ?? data.floorId,
      floorName: data.floor_name ?? data.floorName,
      roomId: data.room_id ?? data.roomId,
      roomName: data.room_name ?? data.roomName,
    });
  }
}

export class AirConditioner extends Device {
  constructor(data: {
    id: string;
    name: string;
    temperature?: number;
    power?: boolean;
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    modelPath?: string;
    floorId?: string | null;
    floorName?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }) {
    super({
      ...data,
      type: DeviceType.AIR_CONDITIONER,
      icon: "snowflake",
      typeLabel: "Air Conditioner",
      temperature: data.temperature ?? 24.0,
    });
  }

  static fromApi(data: any): AirConditioner {
    return new AirConditioner({
      id: data.id,
      name: data.name,
      temperature: data.temperature ?? 24.0,
      power: data.is_on ?? data.power,
      x: data.position?.[0] ?? data.x ?? 0.0,
      y: data.position?.[1] ?? data.y ?? 1.5,
      z: data.position?.[2] ?? data.z ?? 0.0,
      scale: data.scale,
      modelPath: data.model_path ?? data.modelPath,
      floorId: data.floor_id ?? data.floorId,
      floorName: data.floor_name ?? data.floorName,
      roomId: data.room_id ?? data.roomId,
      roomName: data.room_name ?? data.roomName,
    });
  }
}

export class Fan extends Device {
  constructor(data: {
    id: string;
    name: string;
    speed?: number;
    power?: boolean;
    x?: number;
    y?: number;
    z?: number;
    scale?: number;
    modelPath?: string;
    floorId?: string | null;
    floorName?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }) {
    super({
      ...data,
      type: DeviceType.FAN,
      icon: "fan",
      typeLabel: "Tower Fan",
      speed: data.speed ?? 50,
    });
  }

  static fromApi(data: any): Fan {
    return new Fan({
      id: data.id,
      name: data.name,
      speed: data.speed ?? 50,
      power: data.is_on ?? data.power,
      x: data.position?.[0] ?? data.x ?? 0.0,
      y: data.position?.[1] ?? data.y ?? 1.5,
      z: data.position?.[2] ?? data.z ?? 0.0,
      scale: data.scale,
      modelPath: data.model_path ?? data.modelPath,
      floorId: data.floor_id ?? data.floorId,
      floorName: data.floor_name ?? data.floorName,
      roomId: data.room_id ?? data.roomId,
      roomName: data.room_name ?? data.roomName,
    });
  }
}

export const isLightbulb = (device: Device): device is Lightbulb => {
  return device.type === DeviceType.LIGHTBULB;
};

export const isTelevision = (device: Device): device is Television => {
  return device.type === DeviceType.TELEVISION;
};

export const isAirConditioner = (device: Device): device is AirConditioner => {
  return device.type === DeviceType.AIR_CONDITIONER;
};

export const isFan = (device: Device): device is Fan => {
  return device.type === DeviceType.FAN;
};