export const DeviceType = {
  LIGHTBULB: "lightbulb",
  TELEVISION: "television",
  AIR_CONDITIONER: "air_conditioner",
  FAN: "fan",
} as const;

export type DeviceType = typeof DeviceType[keyof typeof DeviceType];

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
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
}

export interface Lightbulb extends Device {
  type: "lightbulb";
  brightness: number;
  colour: string;
  icon: "lightbulb";
  typeLabel: "Light Bulb";
}

export interface Television extends Device {
  type: "television";
  volume: number;
  channel: number;
  icon: "tv";
  typeLabel: "Smart TV";
}

export interface AirConditioner extends Device {
  type: "air_conditioner";
  temperature: number;
  icon: "snowflake";
  typeLabel: "Air Conditioner";
}

export interface Fan extends Device {
  type: "fan";
  speed: number;
  icon: "fan";
  typeLabel: "Tower Fan";
}

export const getDefaultModelPath = (type: DeviceType): string => {
  return `/models/${type}/scene.gltf`;
};

export const getPosition = (device: Device): [number, number, number] => {
  return [device.x, device.y, device.z];
};

export const createDevice = (
  partial: Partial<Device> & { id: string; name: string; type: DeviceType }
): Device => {
  const defaults: Device = {
    id: partial.id,
    name: partial.name,
    type: partial.type,
    power: false,
    x: 0.0,
    y: 0.0,
    z: 0.0,
    scale: 1.0,
    modelPath: "",
    icon: "circle",
    typeLabel: "Device",
    colour: "#ffffff",
    brightness: 0,
    volume: 0,
    channel: 0,
    temperature: 0.0,
    speed: 0,
    floorId: null,
    floorName: null,
    roomId: null,
    roomName: null,
  };

  const device = { ...defaults, ...partial };

  if (!device.modelPath) {
    device.modelPath = getDefaultModelPath(device.type);
  }

  return device;
};

export const createLightbulb = (
  partial: Partial<Lightbulb> & { id: string; name: string }
): Lightbulb => {
  return {
    ...createDevice({
      ...partial,
      type: DeviceType.LIGHTBULB,
    }),
    type: DeviceType.LIGHTBULB,
    brightness: partial.brightness ?? 0,
    colour: partial.colour ?? "#ffffff",
    icon: "lightbulb",
    typeLabel: "Light Bulb",
  } as Lightbulb;
};

export const createTelevision = (
  partial: Partial<Television> & { id: string; name: string }
): Television => {
  return {
    ...createDevice({
      ...partial,
      type: DeviceType.TELEVISION,
    }),
    type: DeviceType.TELEVISION,
    volume: partial.volume ?? 10,
    channel: partial.channel ?? 1,
    icon: "tv",
    typeLabel: "Smart TV",
  } as Television;
};

export const createAirConditioner = (
  partial: Partial<AirConditioner> & { id: string; name: string }
): AirConditioner => {
  return {
    ...createDevice({
      ...partial,
      type: DeviceType.AIR_CONDITIONER,
    }),
    type: DeviceType.AIR_CONDITIONER,
    temperature: partial.temperature ?? 24.0,
    icon: "snowflake",
    typeLabel: "Air Conditioner",
  } as AirConditioner;
};

export const createFan = (
  partial: Partial<Fan> & { id: string; name: string }
): Fan => {
  return {
    ...createDevice({
      ...partial,
      type: DeviceType.FAN,
    }),
    type: DeviceType.FAN,
    speed: partial.speed ?? 50,
    icon: "fan",
    typeLabel: "Tower Fan",
  } as Fan;
};

export const isLightbulb = (device: Device): device is Lightbulb => {
  return device.type === DeviceType.LIGHTBULB;
};

export const isTelevision = (device: Device): device is Television => {
  return device.type === DeviceType.TELEVISION;
};

export const isAirConditioner = (
  device: Device
): device is AirConditioner => {
  return device.type === DeviceType.AIR_CONDITIONER;
};

export const isFan = (device: Device): device is Fan => {
  return device.type === DeviceType.FAN;
};