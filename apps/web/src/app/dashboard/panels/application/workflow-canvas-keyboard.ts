// Keyboard shortcuts of the workflow canvas (US-129). Each one only invokes an
// action another story already offers on screen; this module maps keys to those
// actions and lists them with their visible equivalent.

import type { WorkflowCanvasBox } from "./workflow-canvas-viewport";

export type WorkflowCanvasDirection = "left" | "right" | "up" | "down";

export type WorkflowCanvasShortcut =
  | {
      action:
        | "delete"
        | "selectAll"
        | "fit"
        | "resetZoom"
        | "zoomIn"
        | "zoomOut"
        | "arrange"
        | "openDetails"
        | "addNode"
        | "escape"
        | "help";
    }
  | { action: "selectNeighbor" | "moveSelection"; direction: WorkflowCanvasDirection };

type ShortcutKeys = {
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

const ARROWS: Record<string, WorkflowCanvasDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

// Characters typed as they are; Shift may be needed to type them (+ and ?).
const CHARACTER_SHORTCUTS: Record<string, WorkflowCanvasShortcut["action"]> = {
  "1": "fit",
  "0": "resetZoom",
  "+": "zoomIn",
  "-": "zoomOut",
  "?": "help",
};

// Keys that mean something else with Shift, which is kept for them.
const PLAIN_KEY_SHORTCUTS: Record<string, WorkflowCanvasShortcut["action"]> = {
  Delete: "delete",
  Backspace: "delete",
  Enter: "openDetails",
  Tab: "addNode",
  Escape: "escape",
};

/** The canvas shortcut a key press asks for; macOS uses Cmd where others use Ctrl. */
export function workflowCanvasShortcut(
  event: ShortcutKeys,
  mac: boolean,
): WorkflowCanvasShortcut | null {
  const { key, shiftKey, altKey, ctrlKey, metaKey } = event;
  // The key code is used because Alt changes the typed character on some keyboards.
  if (shiftKey && altKey && !ctrlKey && !metaKey && event.code === "KeyT")
    return { action: "arrange" };
  const command = mac ? metaKey : ctrlKey;
  const otherCommand = mac ? ctrlKey : metaKey;
  if (command && !otherCommand && !altKey && !shiftKey && key.toLowerCase() === "a")
    return { action: "selectAll" };
  // Anything else with Ctrl, Cmd or Alt is left to the browser.
  if (ctrlKey || metaKey || altKey) return null;
  const direction = ARROWS[key];
  if (direction) return { action: shiftKey ? "moveSelection" : "selectNeighbor", direction };
  const character = CHARACTER_SHORTCUTS[key];
  if (character) return { action: character } as WorkflowCanvasShortcut;
  const plain = PLAIN_KEY_SHORTCUTS[key];
  if (plain && !shiftKey) return { action: plain } as WorkflowCanvasShortcut;
  return null;
}

/**
 * The closest node in `direction` from the centre of `fromId`, within 45 degrees
 * of it; a node in line wins over one off to the side. `null` when there is none.
 */
export function workflowCanvasNeighbor(
  boxes: Record<string, WorkflowCanvasBox>,
  fromId: string,
  direction: WorkflowCanvasDirection,
): string | null {
  const from = boxes[fromId];
  if (!from) return null;
  const centre = (box: WorkflowCanvasBox) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  const origin = centre(from);
  let best: { id: string; score: number } | null = null;
  for (const [id, box] of Object.entries(boxes)) {
    if (id === fromId) continue;
    const point = centre(box);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const ahead =
      direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    const aside = Math.abs(direction === "left" || direction === "right" ? dy : dx);
    if (ahead <= 0 || aside > ahead) continue;
    const score = ahead + 2 * aside;
    if (!best || score < best.score) best = { id, score };
  }
  return best?.id ?? null;
}

const IGNORED_TARGETS = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
  "[role='menu']",
  "[role='menubar']",
  "[role='listbox']",
  "[role='dialog']",
  "[role='alertdialog']",
].join(",");

/** Shortcuts never fire while the focus is in a text field, a menu or a dialog. */
export function shortcutsIgnoredAt(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(IGNORED_TARGETS) !== null;
}

type PlatformInfo = { platform: string; userAgent: string };

export function isMacPlatform(
  info: PlatformInfo | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!info) return false;
  return /Mac|iPhone|iPad|iPod/.test(info.platform || info.userAgent);
}

export type WorkflowCanvasShortcutHelp = {
  keys: string;
  action: string;
  /** The control, click or drag on screen that does the same. */
  equivalent: string;
  /** Only administrators who can edit the draft get it. */
  editing?: boolean;
};

/** Every shortcut the person can use, with what it does and its visible equivalent. */
export function workflowCanvasShortcutHelp({
  mac,
  canManage,
}: {
  mac: boolean;
  canManage: boolean;
}): WorkflowCanvasShortcutHelp[] {
  // TODO(US-132): with several nodes selected, Supr opens Eliminar nodos.
  const rows: WorkflowCanvasShortcutHelp[] = [
    {
      keys: "Supr o Retroceso",
      action: "Elimina el nodo o la conexión seleccionados",
      equivalent: "Eliminar nodo o Eliminar conexión",
      editing: true,
    },
    {
      keys: `${mac ? "Cmd" : "Ctrl"} + A`,
      action: "Selecciona todos los nodos",
      equivalent: "Seleccionar todo",
      editing: true,
    },
    { keys: "1", action: "Ajusta la vista a todos los nodos", equivalent: "Ajustar a la vista" },
    {
      keys: "0",
      action: "Restablece el zoom al 100 %",
      equivalent: "Restablecer zoom (clic en el nivel de zoom)",
    },
    { keys: "+", action: "Acerca el lienzo", equivalent: "Acercar" },
    { keys: "-", action: "Aleja el lienzo", equivalent: "Alejar" },
    {
      keys: "Shift + Alt + T",
      action: "Ordena los nodos",
      equivalent: "Ordenar nodos",
      editing: true,
    },
    {
      keys: "Enter",
      action: "Abre Detalles del nodo seleccionado",
      equivalent: "Doble clic sobre el nodo",
    },
    { keys: "Tab", action: "Abre Agregar nodo", equivalent: "Agregar nodo", editing: true },
    {
      keys: "Flechas",
      action: "Selecciona el nodo vecino",
      // Members cannot click a node to select it; they open it with a double click.
      equivalent: canManage ? "Clic sobre un nodo" : "Doble clic sobre el nodo",
    },
    {
      keys: "Shift + flechas",
      action: "Mueve los nodos seleccionados una celda de la cuadrícula",
      equivalent: "Arrastrar los nodos seleccionados",
      editing: true,
    },
    {
      keys: "Esc",
      action: "Cierra los paneles y limpia la selección",
      equivalent: "Botón de cerrar de cada panel o clic sobre el fondo",
    },
    { keys: "?", action: "Muestra estos atajos", equivalent: "Atajos de teclado" },
  ];
  return rows.filter((row) => canManage || !row.editing);
}
