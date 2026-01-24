import { ApiService } from "./ApiService";
import {
  DeviceFactory,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
  type BaseDevice,
} from "@/models";
import {
  DeviceType,
  type DeviceDTO,
  type DevicePosition,
  type LightbulbDTO,
  type TelevisionDTO,
  type FanDTO,
  type AirConditionerDTO,
  type CreateLightbulbDTO,
  type CreateTelevisionDTO,
  type CreateFanDTO,
  type CreateAirConditionerDTO,
} from "@/types/device.types";

export class DeviceService {
  private static instance: DeviceService;
  private api = ApiService.getInstance();

  private constructor() {}

  static getInstance(): DeviceService {
    if (!DeviceService.instance) {
      DeviceService.instance = new DeviceService();
    }
    return DeviceService.instance;
  }

  // === Generic Device Operations ===

  async getAllDevices(): Promise<BaseDevice[]> {
    const data = await this.api.get<DeviceDTO[]>("/api/homes/devices/");
    return data.map((dto) => DeviceFactory.create(dto));
  }

  async getDevice(id: string): Promise<BaseDevice> {
    const data = await this.api.get<DeviceDTO>(`/api/homes/devices/${id}/`);
    return DeviceFactory.create(data);
  }

  async getPosition(id: string): Promise<DevicePosition> {
    return this.api.get<DevicePosition>(
      `/api/homes/devices/${id}/get_position/`,
    );
  }

  async setPosition(
    type: DeviceType,
    id: string,
    pos: { x: number; y: number; z?: number },
  ): Promise<void> {
    const endpoint = this.getTypeEndpoint(type);
    await this.api.post(`/api/homes/${endpoint}/${id}/set_position/`, pos);
  }

  async togglePower(id: string, isOn: boolean): Promise<void> {
    await this.api.patch(`/api/homes/devices/${id}/`, { is_on: isOn });
  }

  // === Lightbulb ===

  async createLightbulb(data: CreateLightbulbDTO): Promise<Lightbulb> {
    const dto = await this.api.post<LightbulbDTO>(
      "/api/homes/lightbulbs/",
      data,
    );
    return new Lightbulb(dto);
  }

  async getLightbulb(id: string): Promise<Lightbulb> {
    const dto = await this.api.get<LightbulbDTO>(
      `/api/homes/lightbulbs/${id}/`,
    );
    return new Lightbulb(dto);
  }

  async deleteLightbulb(id: string): Promise<void> {
    await this.api.delete(`/api/homes/lightbulbs/${id}/`);
  }

  async setBrightness(id: string, brightness: number): Promise<void> {
    await this.api.post(`/api/homes/lightbulbs/${id}/set_brightness/`, {
      brightness,
    });
  }

  async setColour(id: string, colour: string): Promise<void> {
    await this.api.post(`/api/homes/lightbulbs/${id}/set_colour/`, { colour });
  }

  // === Television ===

  async createTelevision(data: CreateTelevisionDTO): Promise<Television> {
    const dto = await this.api.post<TelevisionDTO>("/api/homes/tvs/", data);
    return new Television(dto);
  }

  async getTelevision(id: string): Promise<Television> {
    const dto = await this.api.get<TelevisionDTO>(`/api/homes/tvs/${id}/`);
    return new Television(dto);
  }

  async deleteTelevision(id: string): Promise<void> {
    await this.api.delete(`/api/homes/tvs/${id}/`);
  }

  async setVolume(id: string, volume: number): Promise<void> {
    await this.api.post(`/api/homes/tvs/${id}/set_volume/`, { volume });
  }

  async setChannel(id: string, channel: number): Promise<void> {
    await this.api.post(`/api/homes/tvs/${id}/set_channel/`, { channel });
  }

  async setMute(id: string, mute: boolean): Promise<void> {
    await this.api.post(`/api/homes/tvs/${id}/set_mute/`, { mute });
  }

  // === Fan ===

  async createFan(data: CreateFanDTO): Promise<Fan> {
    const dto = await this.api.post<FanDTO>("/api/homes/fans/", data);
    return new Fan(dto);
  }

  async getFan(id: string): Promise<Fan> {
    const dto = await this.api.get<FanDTO>(`/api/homes/fans/${id}/`);
    return new Fan(dto);
  }

  async deleteFan(id: string): Promise<void> {
    await this.api.delete(`/api/homes/fans/${id}/`);
  }

  async setSpeed(id: string, speed: number): Promise<void> {
    await this.api.post(`/api/homes/fans/${id}/set_speed/`, { speed });
  }

  async setSwing(id: string, swing: boolean): Promise<void> {
    await this.api.post(`/api/homes/fans/${id}/set_swing/`, { swing });
  }

  // === Air Conditioner ===

  async createAirConditioner(
    data: CreateAirConditionerDTO,
  ): Promise<AirConditioner> {
    const dto = await this.api.post<AirConditionerDTO>("/api/homes/acs/", data);
    return new AirConditioner(dto);
  }

  async getAirConditioner(id: string): Promise<AirConditioner> {
    const dto = await this.api.get<AirConditionerDTO>(`/api/homes/acs/${id}/`);
    return new AirConditioner(dto);
  }

  async deleteAirConditioner(id: string): Promise<void> {
    await this.api.delete(`/api/homes/acs/${id}/`);
  }

  async setTemperature(id: string, temp: number): Promise<void> {
    await this.api.post(`/api/homes/acs/${id}/set_temperature/`, { temp });
  }

  // === Helpers ===

  private getTypeEndpoint(type: DeviceType): string {
    switch (type) {
      case DeviceType.Lightbulb:
        return "lightbulbs";
      case DeviceType.Television:
        return "tvs";
      case DeviceType.Fan:
        return "fans";
      case DeviceType.AirConditioner:
        return "acs";
    }
  }

  async deleteDevice(type: DeviceType, id: string): Promise<void> {
    const endpoint = this.getTypeEndpoint(type);
    await this.api.delete(`/api/homes/${endpoint}/${id}/`);
  }
}
