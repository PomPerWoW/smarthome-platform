import axios from "axios";
import { config } from "../config/env";

const api = axios.create({
  baseURL: config.API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
