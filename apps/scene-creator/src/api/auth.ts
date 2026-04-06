import api from "./axios";
import { User, AuthState } from "../types";

export class AuthService {
  private static instance: AuthService;
  private state: AuthState = {
    user: null,
    isAuthenticated: false,
  };
  private token: string | null = null;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<boolean> {
    try {
      const response = await api.get("/api/auth/whoami/");

      this.state.user = response.data.user;
      this.state.isAuthenticated = true;
      this.token = response.data.token || null;
      return true;
    } catch (error) {
      console.error("[Auth] Cookie authentication failed:", error);
      this.state.isAuthenticated = false;
      return false;
    }
  }

  getUser(): User | null {
    return this.state.user;
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  getToken(): string | null {
    return this.token;
  }
}

export const getAuth = () => AuthService.getInstance();
