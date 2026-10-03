import { env } from "@ayni/env/web";
import axios from "axios";

const serverBaseURL = env.NEXT_PUBLIC_SERVER_URL;

export function createHttpClient(baseURL = serverBaseURL) {
  return axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
    timeout: 10_000,
  });
}

export const httpClient = createHttpClient();

let redirectingToForbidden = false;

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 403 &&
      error.config?.method?.toLowerCase() === "get" &&
      typeof window !== "undefined" &&
      (window.location.pathname === "/dashboard" ||
        window.location.pathname.startsWith("/dashboard/")) &&
      !redirectingToForbidden
    ) {
      redirectingToForbidden = true;
      window.location.replace("/forbidden");
    }
    return Promise.reject(error);
  },
);
