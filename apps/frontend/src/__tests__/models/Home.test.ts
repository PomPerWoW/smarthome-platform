import { describe, it, expect } from "vitest";
import { Home } from "@/models/Home";
import type { Room } from "@/models/Room";
import type { HomeDTO } from "@/types/home.types";

describe("Home", () => {
  const mockDTO: HomeDTO = {
    id: "home-123",
    home_name: "My Smart Home",
    user: 1,
  };

  describe("fromApi", () => {
    it("maps DTO fields correctly", () => {
      const home = Home.fromApi(mockDTO);

      expect(home.id).toBe("home-123");
      expect(home.name).toBe("My Smart Home");
      expect(home.userId).toBe(1);
    });

    it("initializes with empty rooms array", () => {
      const home = Home.fromApi(mockDTO);
      expect(home.rooms).toEqual([]);
    });
  });

  describe("toJSON", () => {
    it("serializes back to DTO format", () => {
      const home = Home.fromApi(mockDTO);
      const json = home.toJSON();

      expect(json).toEqual({
        id: "home-123",
        home_name: "My Smart Home",
        user: 1,
      });
    });
  });

  describe("computed properties", () => {
    it("returns 0 roomCount when no rooms", () => {
      const home = Home.fromApi(mockDTO);
      expect(home.roomCount).toBe(0);
    });

    it("returns correct roomCount", () => {
      const home = Home.fromApi(mockDTO);
      home.rooms = [
        { deviceCount: 2 } as Room,
        { deviceCount: 3 } as Room,
      ];
      expect(home.roomCount).toBe(2);
    });

    it("returns correct deviceCount across rooms", () => {
      const home = Home.fromApi(mockDTO);
      home.rooms = [
        { deviceCount: 2 } as Room,
        { deviceCount: 3 } as Room,
        { deviceCount: 0 } as Room,
      ];
      expect(home.deviceCount).toBe(5);
    });

    it("returns 0 deviceCount when no rooms", () => {
      const home = Home.fromApi(mockDTO);
      expect(home.deviceCount).toBe(0);
    });
  });
});
