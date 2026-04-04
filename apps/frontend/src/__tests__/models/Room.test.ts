import { describe, it, expect } from "vitest";
import { Room } from "@/models/Room";
import type { BaseDevice } from "@/models/devices/BaseDevice";
import type { RoomDTO } from "@/types/home.types";

describe("Room", () => {
  const mockDTO: RoomDTO = {
    id: "room-456",
    room_name: "Living Room",
    room_model: "CustomModel",
    home: "home-123",
  };

  describe("fromApi", () => {
    it("maps DTO fields correctly", () => {
      const room = Room.fromApi(mockDTO);

      expect(room.id).toBe("room-456");
      expect(room.name).toBe("Living Room");
      expect(room.homeId).toBe("home-123");
      expect(room.roomModel).toBe("CustomModel");
    });

    it("defaults roomModel to LabPlan when not provided", () => {
      const dtoWithoutModel: RoomDTO = {
        id: "room-789",
        room_name: "Kitchen",
        room_model: undefined as unknown as string,
        home: "home-123",
      };
      const room = Room.fromApi(dtoWithoutModel);
      expect(room.roomModel).toBe("LabPlan");
    });

    it("initializes with empty devices and furniture arrays", () => {
      const room = Room.fromApi(mockDTO);
      expect(room.devices).toEqual([]);
      expect(room.furniture).toEqual([]);
    });
  });

  describe("toJSON", () => {
    it("serializes back to DTO format", () => {
      const room = Room.fromApi(mockDTO);
      expect(room.toJSON()).toEqual({
        id: "room-456",
        room_name: "Living Room",
        room_model: "CustomModel",
        home: "home-123",
      });
    });
  });

  describe("computed properties", () => {
    it("returns correct deviceCount", () => {
      const room = Room.fromApi(mockDTO);
      room.devices = [{} as BaseDevice, {} as BaseDevice];
      expect(room.deviceCount).toBe(2);
    });

    it("returns correct furnitureCount", () => {
      const room = Room.fromApi(mockDTO);
      room.furniture = [
        { id: "1", name: "Sofa", type: "sofa", roomName: null },
        { id: "2", name: "Table", type: "table", roomName: null },
      ];
      expect(room.furnitureCount).toBe(2);
    });

    it("returns 0 counts when empty", () => {
      const room = Room.fromApi(mockDTO);
      expect(room.deviceCount).toBe(0);
      expect(room.furnitureCount).toBe(0);
    });
  });
});
