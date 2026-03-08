export interface HomeDTO {
  id: string;
  home_name: string;
  user: number;
}

export interface RoomDTO {
  id: string;
  room_name: string;
  room_model: string;
  home: string;
}

export interface CreateHomeDTO {
  home_name: string;
}

export interface CreateRoomDTO {
  room_name: string;
  home: string;
  room_model?: string;
}

export interface UpdateHomeDTO {
  home_name?: string;
}

export interface UpdateRoomDTO {
  room_name?: string;
  room_model?: string;
}

export interface FurnitureDTO {
  id: string;
  furniture_name: string;
  furniture_type: string;
  room: string | null;
  device_pos: { x: number | null; y: number | null; z: number | null };
  device_rotation: { x: number; y: number; z: number };
}
