import axios from "axios";
import { config } from "../config/env";

const api = axios.create({
  baseURL: config.BACKEND_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
