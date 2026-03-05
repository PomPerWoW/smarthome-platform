import { ApiService } from "./ApiService";
import { User } from "@/models/User";
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User as UserType,
} from "@/types/auth";

export class AuthService {
  private static instance: AuthService;
  private api = ApiService.getInstance();

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(credentials: LoginRequest): Promise<User> {
    const response = await this.api.post<AuthResponse>(
      "/api/auth/login/",
      credentials,
    );
    return User.fromApi(response.user);
  }

  async register(data: RegisterRequest): Promise<User> {
    const response = await this.api.post<AuthResponse>(
      "/api/auth/register/",
      data,
    );
    return User.fromApi(response.user);
  }

  async logout(): Promise<void> {
    await this.api.post("/api/auth/logout/");
  }

  async whoami(): Promise<{ user: User; token: string } | null> {
    try {
      const response = await this.api.get<{
        user: UserType;
        authenticated: boolean;
        token: string;
      }>("/api/auth/whoami/");
      return { user: User.fromApi(response.user), token: response.token };
    } catch {
      return null;
    }
  }
}
