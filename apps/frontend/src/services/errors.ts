import { AxiosError } from "axios";

export function getErrorMessage(error: unknown): string {
  // Axios error with response
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data;
    console.log("API Error Response:", data);

    if (typeof data === "object") {
      return JSON.stringify(data);
    }

    if (typeof data === "string") return data;
  }

  // Generic Error
  if (error instanceof Error) return error.message;

  return "An unexpected error occurred";
}
