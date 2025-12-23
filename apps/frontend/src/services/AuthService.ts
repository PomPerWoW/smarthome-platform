import { ApiService } from "./ApiService";
import { User } from "@/models/User";
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User as UserType,
} from "@/types/auth";

type WhoamiResponse = {
  authenticated: boolean;
  user: UserType;
  token: string;
};

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

  /**
   * Resolve the current auth_token (cookie/header) into user info.
   * Returns both the token (from backend) and the user so clients can log it
   * even though the cookie itself is HttpOnly.
   */
  async whoami(): Promise<{ user: User; token: string } | null> {
    try {
      const response = await this.api.get<WhoamiResponse>("/api/auth/whoami/");

      // Requirements: log token + decrypted user data on page entry
      console.log("[Auth] auth_token:", response.token);
      console.log("[Auth] decrypted user data:", response.user);

      return { user: User.fromApi(response.user), token: response.token };
    } catch {
      return null;
    }
  }
}
