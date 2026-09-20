// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Highlight, HighlightItem } from "./highlight";

afterEach(() => {
  cleanup();
});

describe("Highlight primitive", () => {
  it("renders parent mode with controlled items", () => {
    const onValueChange = vi.fn();

    render(
      <Highlight mode="parent" controlledItems hover onValueChange={onValueChange}>
        <HighlightItem id="item-1">
          <button type="button">Item 1</button>
        </HighlightItem>
        <HighlightItem id="item-2">
          <button type="button">Item 2</button>
        </HighlightItem>
      </Highlight>,
    );

    const btn1 = screen.getByText("Item 1");
    const btn2 = screen.getByText("Item 2");

    expect(btn1).toBeTruthy();
    expect(btn2).toBeTruthy();

    fireEvent.mouseEnter(btn1);
    expect(onValueChange).toHaveBeenCalledWith("item-1");

    fireEvent.mouseLeave(btn1);
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("renders children mode", () => {
    render(
      <Highlight mode="children" hover>
        <button type="button">Tab 1</button>
        <button type="button">Tab 2</button>
      </Highlight>,
    );

    expect(screen.getByText("Tab 1")).toBeTruthy();
    expect(screen.getByText("Tab 2")).toBeTruthy();
  });
});
