import { describe, expect, it } from "vitest";
import { parseDashboardRoute } from "./dashboard";

describe("parseDashboardRoute dataset detail", () => {
  it("opens a dataset under its owning application", () => {
    expect(parseDashboardRoute("/dashboard/applications/app-1/datasets/dataset-1")).toEqual({
      kind: "app",
      id: "app-1",
      section: "datasets",
      datasetId: "dataset-1",
    });
  });

  it("decodes dataset IDs and rejects malformed encodings", () => {
    expect(parseDashboardRoute("/dashboard/applications/app-1/datasets/dataset%2F1")).toMatchObject(
      {
        kind: "app",
        datasetId: "dataset/1",
      },
    );
    expect(parseDashboardRoute("/dashboard/applications/app-1/datasets/%")).toEqual({
      kind: "list",
    });
  });
});
