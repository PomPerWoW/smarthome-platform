import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/auth";
import { User } from "@/models/User";

describe("Auth Store", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("should have initial state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it("setUser should update state", () => {
    const user = new User(1, "test@example.com");
    const token = "test-token";
    
    useAuthStore.getState().setUser(user, token);
    
    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.token).toBe(token);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("logout should clear state", () => {
    const user = new User(1, "test@example.com");
    useAuthStore.getState().setUser(user, "token");
    
    useAuthStore.getState().logout();
    
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("setLoading should update isLoading", () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
    
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });
});
