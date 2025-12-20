import type { User as UserType } from "@/types/auth";

export class User {
  readonly id: number;
  readonly email: string;

  constructor(id: number, email: string) {
    this.id = id;
    this.email = email;
  }

  get displayName(): string {
    return this.email;
  }

  static fromApi(data: UserType): User {
    return new User(data.id, data.email);
  }

  toJSON(): UserType {
    return {
      id: this.id,
      email: this.email,
    };
  }
}
