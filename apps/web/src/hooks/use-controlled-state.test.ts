// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useControlledState } from "./use-controlled-state";

describe("useControlledState", () => {
  it("uses defaultValue and updates internal state in uncontrolled mode", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useControlledState({ defaultValue: "initial", onChange }));

    expect(result.current[0]).toBe("initial");

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(onChange).toHaveBeenCalledWith("updated");
  });

  it("returns value directly in controlled mode and does not mutate internal state on setState", () => {
    const onChange = vi.fn();
    let parentValue = "controlled";

    const { result, rerender } = renderHook(
      ({ value }) => useControlledState({ value, onChange }),
      { initialProps: { value: parentValue } },
    );

    expect(result.current[0]).toBe("controlled");

    act(() => {
      result.current[1]("ignored-locally");
    });

    // In controlled mode, calling setState triggers onChange but does not mutate internal state
    expect(onChange).toHaveBeenCalledWith("ignored-locally");
    expect(result.current[0]).toBe("controlled");

    // When the parent updates the value prop, the hook reflects it immediately
    parentValue = "new-controlled-value";
    rerender({ value: parentValue });
    expect(result.current[0]).toBe("new-controlled-value");
  });
});
