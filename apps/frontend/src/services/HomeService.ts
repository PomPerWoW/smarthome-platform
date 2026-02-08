import { ApiService } from "./ApiService";
import { Home, Room, DeviceFactory, type BaseDevice } from "@/models";
import type {
  HomeDTO,
  RoomDTO,
  CreateHomeDTO,
  CreateRoomDTO,
} from "@/types/home.types";
import type { DeviceDTO } from "@/types/device.types";

export class HomeService {
  private static instance: HomeService;
  private api = ApiService.getInstance();

  private constructor() {}

  static getInstance(): HomeService {
    if (!HomeService.instance) {
      HomeService.instance = new HomeService();
    }
    return HomeService.instance;
  }

  // === Homes ===

  async getHomes(): Promise<Home[]> {
    const data = await this.api.get<HomeDTO[]>("/api/homes/homes/");
    return data.map((dto) => Home.fromApi(dto));
  }

  async getHome(id: string): Promise<Home> {
    const data = await this.api.get<HomeDTO>(`/api/homes/homes/${id}/`);
    return Home.fromApi(data);
  }

  async createHome(name: string): Promise<Home> {
    const payload: CreateHomeDTO = { home_name: name };
    const data = await this.api.post<HomeDTO>("/api/homes/homes/", payload);
    return Home.fromApi(data);
  }

  async deleteHome(id: string): Promise<void> {
    await this.api.delete(`/api/homes/homes/${id}/`);
  }

  async renameHome(id: string, name: string): Promise<Home> {
    const data = await this.api.patch<HomeDTO>(`/api/homes/homes/${id}/`, {
      home_name: name,
    });
    return Home.fromApi(data);
  }

  async getHomeDevices(homeId: string): Promise<BaseDevice[]> {
    const data = await this.api.get<DeviceDTO[]>(
      `/api/homes/homes/${homeId}/get_devices/`,
    );
    return data.map((dto) => DeviceFactory.create(dto));
  }

  // === Rooms ===

  async getRooms(): Promise<Room[]> {
    const data = await this.api.get<RoomDTO[]>("/api/homes/rooms/");
    return data.map((dto) => Room.fromApi(dto));
  }

  async getHomeRooms(homeId: string): Promise<Room[]> {
    // Fetch all rooms and filter by homeId
    const allRooms = await this.getRooms();
    return allRooms.filter((room) => room.homeId === homeId);
  }

  async getRoom(id: string): Promise<Room> {
    const data = await this.api.get<RoomDTO>(`/api/homes/rooms/${id}/`);
    return Room.fromApi(data);
  }

  async createRoom(name: string, homeId: string): Promise<Room> {
    const payload: CreateRoomDTO = { room_name: name, home: homeId };
    const data = await this.api.post<RoomDTO>("/api/homes/rooms/", payload);
    return Room.fromApi(data);
  }

  async deleteRoom(id: string): Promise<void> {
    await this.api.delete(`/api/homes/rooms/${id}/`);
  }

  async renameRoom(id: string, name: string): Promise<Room> {
    const data = await this.api.patch<RoomDTO>(`/api/homes/rooms/${id}/`, {
      room_name: name,
    });
    return Room.fromApi(data);
  }

  async getRoomDevices(roomId: string): Promise<BaseDevice[]> {
    const data = await this.api.get<DeviceDTO[]>(
      `/api/homes/rooms/${roomId}/get_devices/`,
    );
    return data.map((dto) => DeviceFactory.create(dto));
  }
}
