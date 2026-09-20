// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy";

describe("CopyButton", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });
    writeTextMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders with default copy icon and custom content", () => {
    render(<CopyButton content="sdk_test_token_123" data-testid="copy-btn" />);
    const button = screen.getByTestId("copy-btn");
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-label")).toBe("Copiar");
  });

  it("copies content to clipboard on click and toggles to check icon", async () => {
    render(<CopyButton content="my-sdk-secret" data-testid="copy-btn" />);
    const button = screen.getByTestId("copy-btn");

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeTextMock).toHaveBeenCalledWith("my-sdk-secret");
    expect(button.getAttribute("aria-label")).toBe("Copiado");
  });

  it("resets copied state after the specified delay", async () => {
    render(<CopyButton content="temp-secret" delay={1500} data-testid="copy-btn" />);
    const button = screen.getByTestId("copy-btn");

    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute("aria-label")).toBe("Copiado");

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(button.getAttribute("aria-label")).toBe("Copiar");
  });

  it("calls onCopiedChange callback when copied state changes", async () => {
    const onCopiedChange = vi.fn();
    render(
      <CopyButton
        content="callback-secret"
        delay={1000}
        onCopiedChange={onCopiedChange}
        data-testid="copy-btn"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-btn"));
    });

    expect(onCopiedChange).toHaveBeenCalledWith(true, "callback-secret");
    expect(onCopiedChange).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(onCopiedChange).toHaveBeenCalledWith(false);
    expect(onCopiedChange).toHaveBeenCalledTimes(2);
  });

  it("renders children alongside the animated icon when provided", () => {
    render(
      <CopyButton content="secret-with-label" data-testid="copy-btn">
        Copiar credencial
      </CopyButton>,
    );

    const button = screen.getByTestId("copy-btn");
    expect(button.textContent).toContain("Copiar credencial");
  });

  it("respects controlled copied state", () => {
    const { rerender } = render(
      <CopyButton content="controlled-secret" copied={true} data-testid="copy-btn" />,
    );

    expect(screen.getByTestId("copy-btn").getAttribute("aria-label")).toBe("Copiado");

    rerender(<CopyButton content="controlled-secret" copied={false} data-testid="copy-btn" />);
    expect(screen.getByTestId("copy-btn").getAttribute("aria-label")).toBe("Copiar");
  });
});
