import api from "./axios";
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

  async getFullHomeData(): Promise<Home[]> {
    const response = await api.get<Home[]>("/api/home/homes/all/");
    return response.data;
  }

  async getHomes(): Promise<{ id: string; name: string }[]> {
    const response =
      await api.get<{ id: string; name: string }[]>("/api/home/homes/");
    return response.data;
  }

  async getAllDevices(): Promise<Device[]> {
    const response = await api.get<Device[]>("/api/home/devices/");
    return response.data;
  }

  async toggleDevice(deviceId: string, on?: boolean): Promise<Device> {
    const body = on !== undefined ? { on } : {};
    const response = await api.post<Device>(
      `/api/home/devices/${deviceId}/toggle/`,
      body,
    );
    return response.data;
  }

  async getDevicePosition(
    deviceId: string,
  ): Promise<{ position: [number, number, number] | null }> {
    const response = await api.get<{
      position: [number, number, number] | null;
    }>(`/api/home/devices/${deviceId}/position/`);
    return response.data;
  }

  async setDevicePosition(
    deviceId: string,
    position: { lon: number; lat: number; alt?: number },
  ): Promise<Device> {
    const response = await api.post<Device>(
      `/api/home/devices/${deviceId}/position/`,
      position,
    );
    return response.data;
  }

  async getLightbulb(deviceId: string): Promise<Lightbulb> {
    const response = await api.get<Lightbulb>(
      `/api/home/devices/${deviceId}/lightbulb/`,
    );
    return response.data;
  }

  async setLightbulb(
    deviceId: string,
    options: { brightness?: number; colour?: string },
  ): Promise<Lightbulb> {
    const response = await api.post<Lightbulb>(
      `/api/home/devices/${deviceId}/lightbulb/`,
      options,
    );
    return response.data;
  }

  async getTelevision(deviceId: string): Promise<Television> {
    const response = await api.get<Television>(
      `/api/home/devices/${deviceId}/television/`,
    );
    return response.data;
  }

  async setTelevision(
    deviceId: string,
    options: { volume?: number; channel?: number },
  ): Promise<Television> {
    const response = await api.post<Television>(
      `/api/home/devices/${deviceId}/television/`,
      options,
    );
    return response.data;
  }

  async getFan(deviceId: string): Promise<Fan> {
    const response = await api.get<Fan>(`/api/home/devices/${deviceId}/fan/`);
    return response.data;
  }

  async setFan(
    deviceId: string,
    options: { speed?: number; swing?: boolean },
  ): Promise<Fan> {
    const response = await api.post<Fan>(
      `/api/home/devices/${deviceId}/fan/`,
      options,
    );
    return response.data;
  }

  async getAirConditioner(deviceId: string): Promise<AirConditioner> {
    const response = await api.get<AirConditioner>(
      `/api/home/devices/${deviceId}/air-conditioner/`,
    );
    return response.data;
  }

  async setAirConditioner(
    deviceId: string,
    options: { temperature?: number },
  ): Promise<AirConditioner> {
    const response = await api.post<AirConditioner>(
      `/api/home/devices/${deviceId}/air-conditioner/`,
      options,
    );
    return response.data;
  }
}

export const getApiClient = (): BackendApiClient => {
  return BackendApiClient.getInstance();
};
