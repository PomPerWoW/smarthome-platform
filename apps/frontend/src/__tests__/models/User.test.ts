import { describe, it, expect } from "vitest";
import { User } from "@/models/User";
import type { User as UserType } from "@/types/auth";

describe("User", () => {
  const mockUserData: UserType = {
    id: 42,
    email: "test@example.com",
  };

  describe("fromApi", () => {
    it("maps DTO fields correctly", () => {
      const user = User.fromApi(mockUserData);

      expect(user.id).toBe(42);
      expect(user.email).toBe("test@example.com");
    });
  });

  describe("displayName", () => {
    it("returns the email as display name", () => {
      const user = User.fromApi(mockUserData);
      expect(user.displayName).toBe("test@example.com");
    });
  });

  describe("toJSON", () => {
    it("serializes back to the API shape", () => {
      const user = User.fromApi(mockUserData);
      expect(user.toJSON()).toEqual({
        id: 42,
        email: "test@example.com",
      });
    });
  });
});
