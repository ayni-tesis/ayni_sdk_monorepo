// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublishWorkflowVersionDialog,
  type PublishWorkflowVersionDialogProps,
  SEGMENTATION_SDK_NOTICE,
} from "./workflow-detail-view";

vi.mock("@/lib/http-client", () => ({ httpClient: { get: vi.fn() } }));

afterEach(cleanup);

const props = (overrides: Partial<PublishWorkflowVersionDialogProps> = {}) => ({
  open: true,
  onOpenChange: vi.fn(),
  version: "",
  setVersion: vi.fn(),
  versionError: "",
  setVersionError: vi.fn(),
  publishing: false,
  onSubmit: vi.fn(),
  ...overrides,
});

describe("PublishWorkflowVersionDialog (US-159)", () => {
  it("warns that a draft with segmentation requires ayni_sdk 0.4.0", () => {
    render(<PublishWorkflowVersionDialog {...props({ hasSegmentation: true })} />);

    expect(screen.getByRole("note").textContent).toBe(SEGMENTATION_SDK_NOTICE);
  });

  it("shows no SDK notice for a draft without segmentation", () => {
    render(<PublishWorkflowVersionDialog {...props()} />);

    expect(screen.queryByRole("note")).toBeNull();
  });
});
