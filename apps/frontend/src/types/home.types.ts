export interface HomeDTO {
  id: string;
  home_name: string;
  user: number;
}

export interface RoomDTO {
  id: string;
  room_name: string;
  home: string;
}

export interface CreateHomeDTO {
  home_name: string;
}

export interface CreateRoomDTO {
  room_name: string;
  home: string;
}
