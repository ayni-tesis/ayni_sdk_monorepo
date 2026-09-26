// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  isMacPlatform,
  shortcutsIgnoredAt,
  workflowCanvasNeighbor,
  workflowCanvasShortcut,
  workflowCanvasShortcutHelp,
} from "./workflow-canvas-keyboard";

const key = (
  value: string,
  modifiers: Partial<Record<"shiftKey" | "altKey" | "ctrlKey" | "metaKey", boolean>> = {},
  code = "",
) => ({
  key: value,
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...modifiers,
});

describe("workflowCanvasShortcut", () => {
  it.each([
    ["Delete", "delete"],
    ["Backspace", "delete"],
    ["1", "fit"],
    ["0", "resetZoom"],
    ["+", "zoomIn"],
    ["=", "zoomIn"],
    ["-", "zoomOut"],
    ["Enter", "openDetails"],
    ["Tab", "addNode"],
    ["Escape", "escape"],
  ])("maps %s to %s", (value, action) => {
    expect(workflowCanvasShortcut(key(value), false)).toEqual({ action });
  });

  it("maps ? and + typed with Shift", () => {
    expect(workflowCanvasShortcut(key("?", { shiftKey: true }), false)).toEqual({
      action: "help",
    });
    expect(workflowCanvasShortcut(key("+", { shiftKey: true }), false)).toEqual({
      action: "zoomIn",
    });
  });

  it.each([
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
  ])(
    "maps %s to the neighbor on the %s, and with Shift to moving the selection",
    (value, direction) => {
      expect(workflowCanvasShortcut(key(value), false)).toEqual({
        action: "selectNeighbor",
        direction,
      });
      expect(workflowCanvasShortcut(key(value, { shiftKey: true }), false)).toEqual({
        action: "moveSelection",
        direction,
      });
    },
  );

  it("maps Shift + Alt + T by its key code, whatever character Alt types", () => {
    expect(
      workflowCanvasShortcut(key("ˇ", { shiftKey: true, altKey: true }, "KeyT"), false),
    ).toEqual({ action: "arrange" });
  });

  it("selects everything with Ctrl + A, and with Cmd + A on macOS", () => {
    expect(workflowCanvasShortcut(key("a", { ctrlKey: true }), false)).toEqual({
      action: "selectAll",
    });
    expect(workflowCanvasShortcut(key("A", { metaKey: true }), true)).toEqual({
      action: "selectAll",
    });
    expect(workflowCanvasShortcut(key("a", { metaKey: true }), false)).toBeNull();
    expect(workflowCanvasShortcut(key("a", { ctrlKey: true }), true)).toBeNull();
  });

  it("leaves other keys and the browser's own shortcuts alone", () => {
    expect(workflowCanvasShortcut(key("a"), false)).toBeNull();
    expect(workflowCanvasShortcut(key("0", { ctrlKey: true }), false)).toBeNull();
    expect(workflowCanvasShortcut(key("+", { metaKey: true }), true)).toBeNull();
    expect(workflowCanvasShortcut(key("Tab", { shiftKey: true }), false)).toBeNull();
    expect(workflowCanvasShortcut(key("Enter", { shiftKey: true }), false)).toBeNull();
    expect(workflowCanvasShortcut(key("ArrowLeft", { altKey: true }), false)).toBeNull();
    expect(workflowCanvasShortcut(key("Backspace", { ctrlKey: true }), false)).toBeNull();
  });
});

describe("workflowCanvasNeighbor", () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 100 });
  // image → model → output, with a condition below the model.
  const boxes = {
    image: box(0, 0),
    model: box(300, 0),
    condition: box(300, 250),
    output: box(600, 20),
  };

  it("picks the closest node in the direction, preferring one in line", () => {
    expect(workflowCanvasNeighbor(boxes, "image", "right")).toBe("model");
    expect(workflowCanvasNeighbor(boxes, "model", "right")).toBe("output");
    expect(workflowCanvasNeighbor(boxes, "model", "down")).toBe("condition");
    expect(workflowCanvasNeighbor(boxes, "condition", "up")).toBe("model");
    expect(workflowCanvasNeighbor(boxes, "output", "left")).toBe("model");
  });

  it("reaches a node off to the side within 45 degrees of the direction", () => {
    expect(workflowCanvasNeighbor(boxes, "condition", "right")).toBe("output");
    expect(workflowCanvasNeighbor(boxes, "condition", "left")).toBe("image");
  });

  it("keeps the node when there is none in that direction", () => {
    expect(workflowCanvasNeighbor(boxes, "image", "left")).toBeNull();
    expect(workflowCanvasNeighbor(boxes, "image", "up")).toBeNull();
    // The condition lies further right than below the image.
    expect(workflowCanvasNeighbor(boxes, "image", "down")).toBeNull();
    expect(workflowCanvasNeighbor(boxes, "missing", "right")).toBeNull();
  });
});

describe("shortcutsIgnoredAt", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    ["a text field", '<input id="target" />'],
    ["a text area", '<textarea id="target"></textarea>'],
    ["a select", '<select id="target"></select>'],
    ["an editable element", '<div contenteditable="true"><span id="target"></span></div>'],
    ["a menu", '<div role="menu"><div id="target" role="menuitem"></div></div>'],
    ["a listbox", '<div role="listbox"><div id="target" role="option"></div></div>'],
    ["a dialog", '<div role="dialog"><button id="target" type="button"></button></div>'],
    [
      "an alert dialog",
      '<div role="alertdialog"><button id="target" type="button"></button></div>',
    ],
  ])("ignores shortcuts in %s", (_case, html) => {
    document.body.innerHTML = html;

    expect(shortcutsIgnoredAt(document.getElementById("target"))).toBe(true);
  });

  it("keeps shortcuts on the canvas and its buttons", () => {
    document.body.innerHTML =
      '<section id="canvas" tabindex="0"><button id="node" type="button"></button></section>';

    expect(shortcutsIgnoredAt(document.getElementById("canvas"))).toBe(false);
    expect(shortcutsIgnoredAt(document.getElementById("node"))).toBe(false);
    expect(shortcutsIgnoredAt(null)).toBe(false);
  });
});

describe("isMacPlatform", () => {
  it("recognizes macOS and iPadOS", () => {
    expect(isMacPlatform({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(isMacPlatform({ platform: "iPad", userAgent: "" })).toBe(true);
    expect(
      isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }),
    ).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe(
      false,
    );
    expect(isMacPlatform(undefined)).toBe(false);
  });
});

describe("workflowCanvasShortcutHelp", () => {
  const keys = (rows: { keys: string }[]) => rows.map((row) => row.keys);

  it("lists every shortcut with its visible equivalent for administrators", () => {
    const rows = workflowCanvasShortcutHelp({ mac: false, canManage: true });

    expect(keys(rows)).toEqual([
      "Supr o Retroceso",
      "Ctrl + A",
      "1",
      "0",
      "+",
      "-",
      "Shift + Alt + T",
      "Enter",
      "Tab",
      "Flechas",
      "Shift + flechas",
      "Esc",
      "?",
    ]);
    expect(rows.find((row) => row.keys === "Supr o Retroceso")?.equivalent).toBe(
      "Eliminar nodo o Eliminar conexión",
    );
    expect(rows.find((row) => row.keys === "Ctrl + A")?.equivalent).toBe("Seleccionar todo");
    expect(rows.find((row) => row.keys === "Enter")?.equivalent).toBe("Doble clic sobre el nodo");
    expect(rows.find((row) => row.keys === "Flechas")?.equivalent).toBe("Clic sobre un nodo");
    expect(rows.find((row) => row.keys === "Shift + flechas")?.equivalent).toBe(
      "Arrastrar los nodos seleccionados",
    );
    expect(rows.find((row) => row.keys === "Esc")?.equivalent).toBe(
      "Botón de cerrar de cada panel o clic sobre el fondo",
    );
    for (const row of rows) {
      expect(row.action).not.toBe("");
      expect(row.equivalent).not.toBe("");
    }
  });

  it("names Cmd instead of Ctrl on macOS", () => {
    expect(keys(workflowCanvasShortcutHelp({ mac: true, canManage: true }))).toContain("Cmd + A");
  });

  it("lists only navigation shortcuts for members", () => {
    expect(keys(workflowCanvasShortcutHelp({ mac: false, canManage: false }))).toEqual([
      "1",
      "0",
      "+",
      "-",
      "Esc",
      "?",
    ]);
  });
});
