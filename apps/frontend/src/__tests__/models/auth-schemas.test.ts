import { describe, it, expect } from "vitest";
import {
  userSchema,
  loginRequestSchema,
  registerRequestSchema,
} from "@/types/auth";

describe("Auth Zod Schemas", () => {
  describe("userSchema", () => {
    it("validates a correct user object", () => {
      const result = userSchema.safeParse({ id: 1, email: "test@example.com" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = userSchema.safeParse({ id: 1, email: "not-an-email" });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = userSchema.safeParse({ email: "test@example.com" });
      expect(result.success).toBe(false);
    });
  });

  describe("loginRequestSchema", () => {
    it("validates valid credentials", () => {
      const result = loginRequestSchema.safeParse({
        email: "user@example.com",
        password: "secret123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = loginRequestSchema.safeParse({
        email: "bad",
        password: "secret123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty password", () => {
      const result = loginRequestSchema.safeParse({
        email: "user@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("registerRequestSchema", () => {
    it("validates valid registration", () => {
      const result = registerRequestSchema.safeParse({
        email: "user@example.com",
        password: "password123",
        password_confirm: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const result = registerRequestSchema.safeParse({
        email: "user@example.com",
        password: "short",
        password_confirm: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects mismatched passwords", () => {
      const result = registerRequestSchema.safeParse({
        email: "user@example.com",
        password: "password123",
        password_confirm: "different456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = registerRequestSchema.safeParse({
        email: "not-valid",
        password: "password123",
        password_confirm: "password123",
      });
      expect(result.success).toBe(false);
    });
  });
});
