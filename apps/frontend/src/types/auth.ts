import * as z from "zod";

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.email(),
});

export type User = z.infer<typeof userSchema>;

// Login request
export const loginRequestSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Register request
export const registerRequestSchema = z
  .object({
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password_confirm: z.string(),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "Passwords don't match",
    path: ["password_confirm"],
  });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

// Auth response
export const authResponseSchema = z.object({
  message: z.string(),
  user: userSchema,
  token: z.string(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
