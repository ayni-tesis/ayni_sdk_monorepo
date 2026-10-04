import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { registerSdkRoutes, sdkApiDescription } from "./sdk-openapi";
import { registerValidationDatasetRoutes } from "./validation-datasets";

extendZodWithOpenApi(z);

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .openapi("HealthResponse");

export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerPath({
    method: "get",
    path: "/health",
    tags: ["System"],
    responses: {
      "200": {
        description: "Service health",
        content: { "application/json": { schema: HealthResponseSchema } },
      },
    },
  });
  registerSdkRoutes(registry);
  registerValidationDatasetRoutes(registry);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "ayni API",
      version: "0.1.0",
      description: sdkApiDescription,
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
  });
}

export const openApiDocument = createOpenApiDocument();

export * from "./validation-datasets";
