import api from "./axios";
import { mapRawDevicesToDevices, mapRawDeviceToDevice } from "./deviceMapper";
import {
  Device,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
  Home,
} from "../types";

export class BackendApiClient {
  private static instance: BackendApiClient;

  private constructor() {}

  static getInstance(): BackendApiClient {
    if (!BackendApiClient.instance) {
      BackendApiClient.instance = new BackendApiClient();
    }
    return BackendApiClient.instance;
  }

  // ===== Home Management =====
  async getFullHomeData(): Promise<Home[]> {
    const response = await api.get<Home[]>("/api/homes/homes/");
    return response.data;
  }

  async getHomes(): Promise<{ id: string; name: string }[]> {
    const response =
      await api.get<{ id: string; name: string }[]>("/api/homes/homes/");
    return response.data;
  }

  // ===== Device Management =====
  async getAllDevices(): Promise<Device[]> {
    const response = await api.get<any[]>("/api/homes/devices/");
    return mapRawDevicesToDevices(response.data);
  }

  async setDeviceState(
    deviceId: string,
    updates: Partial<Device>,
  ): Promise<Device> {
    await api.patch<any>(`/api/homes/devices/${deviceId}/`, updates);
    const response = await api.get<any>(`/api/homes/devices/${deviceId}/`);
    return mapRawDeviceToDevice(response.data);
  }

  // ===== Device Position =====
  async getDevicePosition(
    deviceId: string,
  ): Promise<{ position: [number, number, number] | null }> {
    const response = await api.get<{
      position: [number, number, number] | null;
    }>(`/api/homes/devices/${deviceId}/get_position/`);
    return response.data;
  }

  async setDevicePosition(
    deviceId: string,
    position: { x: number; y: number; z: number; rotation_y?: number },
  ): Promise<Device> {
    await api.post<any>(
      `/api/homes/devices/${deviceId}/set_position/`,
      position,
    );
    const response = await api.get<any>(`/api/homes/devices/${deviceId}/`);
    return mapRawDeviceToDevice(response.data);
  }

  // ===== Lightbulb Controls =====
  async getLightbulb(deviceId: string): Promise<Lightbulb> {
    const response = await api.get<any>(`/api/homes/lightbulbs/${deviceId}/`);
    return mapRawDeviceToDevice(response.data) as Lightbulb;
  }

  async setLightbulb(
    deviceId: string,
    options: { brightness?: number; colour?: string },
  ): Promise<Lightbulb> {
    if (options.brightness !== undefined) {
      await api.post<any>(`/api/homes/lightbulbs/${deviceId}/set_brightness/`, {
        brightness: options.brightness,
      });
    }

    if (options.colour !== undefined) {
      await api.post<any>(`/api/homes/lightbulbs/${deviceId}/set_colour/`, {
        colour: options.colour,
      });
    }

    return this.getLightbulb(deviceId);
  }

  // ===== Television Controls =====
  async getTelevision(deviceId: string): Promise<Television> {
    const response = await api.get<any>(`/api/homes/tvs/${deviceId}/`);
    return mapRawDeviceToDevice(response.data) as Television;
  }

  async setTelevision(
    deviceId: string,
    options: { volume?: number; channel?: number },
  ): Promise<Television> {
    let response: any;

    if (options.volume !== undefined) {
      await api.post<any>(`/api/homes/tvs/${deviceId}/set_volume/`, {
        volume: options.volume,
      });
    }

    if (options.channel !== undefined) {
      await api.post<any>(`/api/homes/tvs/${deviceId}/set_channel/`, {
        channel: options.channel,
      });
    }

    return this.getTelevision(deviceId);
  }

  // ===== Fan Controls =====
  async getFan(deviceId: string): Promise<Fan> {
    const response = await api.get<any>(`/api/homes/fans/${deviceId}/`);
    return mapRawDeviceToDevice(response.data) as Fan;
  }

  async setFan(
    deviceId: string,
    options: { speed?: number; swing?: boolean },
  ): Promise<Fan> {
    let response: any;

    if (options.speed !== undefined) {
      await api.post<any>(`/api/homes/fans/${deviceId}/set_speed/`, {
        speed: options.speed,
      });
    }

    if (options.swing !== undefined) {
      await api.post<any>(`/api/homes/fans/${deviceId}/set_swing/`, {
        swing: options.swing,
      });
    }

    return this.getFan(deviceId);
  }

  // ===== Air Conditioner Controls =====
  async getAirConditioner(deviceId: string): Promise<AirConditioner> {
    const response = await api.get<any>(`/api/homes/acs/${deviceId}/`);
    return mapRawDeviceToDevice(response.data) as AirConditioner;
  }

  async setAirConditioner(
    deviceId: string,
    options: { temperature?: number },
  ): Promise<AirConditioner> {
    await api.post<any>(`/api/homes/acs/${deviceId}/set_temperature/`, {
      temp: options.temperature,
    });
    return this.getAirConditioner(deviceId);
  }
}

export const getApiClient = (): BackendApiClient => {
  return BackendApiClient.getInstance();
};
