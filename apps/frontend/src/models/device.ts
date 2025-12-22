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
  model_path: string;
  icon: string;
  type_label: string;
  colour: string;
  brightness: number;
  volume: number;
  channel: number;
  temperature: number;
  speed: number;
  floor_id?: string | null;
  floor_name?: string | null;
  room_id?: string | null;
  room_name?: string | null;
}

export interface Lightbulb extends Device {
  type: "lightbulb";
  brightness: number;
  colour: string;
  icon: "lightbulb";
  type_label: "Light Bulb";
}

export interface Television extends Device {
  type: "television";
  volume: number;
  channel: number;
  icon: "tv";
  type_label: "Smart TV";
}

export interface AirConditioner extends Device {
  type: "air_conditioner";
  temperature: number;
  icon: "snowflake";
  type_label: "Air Conditioner";
}

export interface Fan extends Device {
  type: "fan";
  speed: number;
  icon: "fan";
  type_label: "Tower Fan";
}

export const get_default_model_path = (type: DeviceType): string => {
  return `/models/${type}/scene.gltf`;
};

export const get_position = (device: Device): [number, number, number] => {
  return [device.x, device.y, device.z];
};

export const create_device = (
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
    model_path: "",
    icon: "circle",
    type_label: "Device",
    colour: "#ffffff",
    brightness: 0,
    volume: 0,
    channel: 0,
    temperature: 0.0,
    speed: 0,
    floor_id: null,
    floor_name: null,
    room_id: null,
    room_name: null,
  };

  const device = { ...defaults, ...partial };

  if (!device.model_path) {
    device.model_path = get_default_model_path(device.type);
  }

  return device;
};

export const create_lightbulb = (
  partial: Partial<Lightbulb> & { id: string; name: string }
): Lightbulb => {
  return {
    ...create_device({
      ...partial,
      type: DeviceType.LIGHTBULB,
    }),
    type: DeviceType.LIGHTBULB,
    brightness: partial.brightness ?? 0,
    colour: partial.colour ?? "#ffffff",
    icon: "lightbulb",
    type_label: "Light Bulb",
  } as Lightbulb;
};

export const create_television = (
  partial: Partial<Television> & { id: string; name: string }
): Television => {
  return {
    ...create_device({
      ...partial,
      type: DeviceType.TELEVISION,
    }),
    type: DeviceType.TELEVISION,
    volume: partial.volume ?? 10,
    channel: partial.channel ?? 1,
    icon: "tv",
    type_label: "Smart TV",
  } as Television;
};

export const create_air_conditioner = (
  partial: Partial<AirConditioner> & { id: string; name: string }
): AirConditioner => {
  return {
    ...create_device({
      ...partial,
      type: DeviceType.AIR_CONDITIONER,
    }),
    type: DeviceType.AIR_CONDITIONER,
    temperature: partial.temperature ?? 24.0,
    icon: "snowflake",
    type_label: "Air Conditioner",
  } as AirConditioner;
};

export const create_fan = (
  partial: Partial<Fan> & { id: string; name: string }
): Fan => {
  return {
    ...create_device({
      ...partial,
      type: DeviceType.FAN,
    }),
    type: DeviceType.FAN,
    speed: partial.speed ?? 50,
    icon: "fan",
    type_label: "Tower Fan",
  } as Fan;
};

export const is_lightbulb = (device: Device): device is Lightbulb => {
  return device.type === DeviceType.LIGHTBULB;
};

export const is_television = (device: Device): device is Television => {
  return device.type === DeviceType.TELEVISION;
};

export const is_air_conditioner = (device: Device): device is AirConditioner => {
  return device.type === DeviceType.AIR_CONDITIONER;
};

export const is_fan = (device: Device): device is Fan => {
  return device.type === DeviceType.FAN;
};