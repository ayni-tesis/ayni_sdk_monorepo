"use client";

import {
  DATASET_ANNOTATIONS_MAX,
  DATASET_LABEL_MAX_LENGTH,
  type DatasetAnnotation,
  type DatasetDetailResponse,
  parseDatasetAnnotationsRequest,
} from "@ayni/api/datasets";
import Image from "next/image";
import { type FormEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api-error";

type DatasetItem = DatasetDetailResponse["items"][number];

/** A box being edited, in pixels of the evidence image, as the person typed them. */
type DraftBox = {
  key: number;
  label: string;
  xMin: string;
  yMin: string;
  xMax: string;
  yMax: string;
};

const COORDINATES = [
  { name: "xMin", label: "X mínima", axis: "x" },
  { name: "yMin", label: "Y mínima", axis: "y" },
  { name: "xMax", label: "X máxima", axis: "x" },
  { name: "yMax", label: "Y máxima", axis: "y" },
] as const;

/**
 * The `Anotaciones revisadas` panel of a detection item (US-082): the evidence
 * image with the boxes being edited drawn over it, and one field group per
 * box. People edit pixels of the image; the saved boxes are relative to its
 * width and height (0 to 1), like the prediction, which stays read-only.
 */
export function ReviewedAnnotationsPanel({
  item,
  predictionSummary,
  onSave,
}: {
  item: DatasetItem;
  predictionSummary: string;
  onSave: (itemId: string, annotations: DatasetAnnotation[]) => Promise<void>;
}) {
  const id = useId();
  const nextKey = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: number;
    mode: "move" | "resize";
    pointerX: number;
    pointerY: number;
    scaleX: number;
    scaleY: number;
    start: Record<(typeof COORDINATES)[number]["name"], number>;
  } | null>(null);
  const { reviewedAnnotations, originalResult, imageWidth, imageHeight } = item;
  const [draft, setDraft] = useState(() => initialDraft(item, nextKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const suggestions = detectionLabels(originalResult);
  const size = { x: imageWidth, y: imageHeight };
  // Compared by value: reloading the detail (e.g. after adding evidence) builds
  // new objects but must keep unsaved edits; only saving new boxes resets them.
  const draftSource = JSON.stringify({
    reviewedAnnotations,
    originalResult,
    imageWidth,
    imageHeight,
  });

  useEffect(() => {
    setDraft(initialDraft(JSON.parse(draftSource), nextKey));
  }, [draftSource]);

  function update(key: number, change: Partial<Omit<DraftBox, "key">>) {
    setDraft((current) => current.map((box) => (box.key === key ? { ...box, ...change } : box)));
  }

  function startDrag(event: PointerEvent<HTMLElement>, box: DraftBox, mode: "move" | "resize") {
    const frame = frameRef.current?.getBoundingClientRect();
    const start = numericBox(box);
    if (saving || !frame?.width || !frame.height || !start) return;
    event.preventDefault();
    event.stopPropagation();
    frameRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      key: box.key,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      // Screen pixels to image pixels: the image may be drawn smaller than it is.
      scaleX: size.x / frame.width,
      scaleY: size.y / frame.height,
      start,
    };
  }

  function drag(event: PointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current) return;
    const dx = (event.clientX - current.pointerX) * current.scaleX;
    const dy = (event.clientY - current.pointerY) * current.scaleY;
    const { xMin, yMin, xMax, yMax } = current.start;
    // Dragging keeps the box inside the image; only typed values can leave it.
    if (current.mode === "move") {
      const left = between(xMin + dx, 0, size.x - (xMax - xMin));
      const top = between(yMin + dy, 0, size.y - (yMax - yMin));
      update(current.key, {
        xMin: roundPixels(left),
        yMin: roundPixels(top),
        xMax: roundPixels(left + xMax - xMin),
        yMax: roundPixels(top + yMax - yMin),
      });
    } else {
      update(current.key, {
        xMax: roundPixels(between(xMax + dx, xMin + 1, size.x)),
        yMax: roundPixels(between(yMax + dy, yMin + 1, size.y)),
      });
    }
  }

  function endDrag() {
    dragRef.current = null;
  }

  function addBox() {
    setDraft((current) => [
      ...current,
      toDraftBox(
        { label: "", box: { xMin: 0.25, yMin: 0.25, xMax: 0.75, yMax: 0.75 } },
        size,
        nextKey,
      ),
    ]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const parsed = parseDatasetAnnotationsRequest({
      annotations: draft.map((box) => ({
        label: box.label,
        box: {
          xMin: pixels(box.xMin) / size.x,
          yMin: pixels(box.yMin) / size.y,
          xMax: pixels(box.xMax) / size.x,
          yMax: pixels(box.yMax) / size.y,
        },
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(item.id, parsed.data.annotations);
    } catch (saveError) {
      setError(errorMessage(saveError, "No pudimos guardar las anotaciones revisadas."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 space-y-3 rounded-md border p-3">
      <h3 id={`${id}-title`} className="font-medium text-sm">
        Anotaciones revisadas
      </h3>
      <div
        ref={frameRef}
        className="relative inline-block max-w-full touch-none select-none"
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Image
          src={item.imageUrl}
          alt={`Evidencia ${item.evidenceId}`}
          width={item.imageWidth}
          height={item.imageHeight}
          unoptimized
          draggable={false}
          className="block max-h-80 w-auto max-w-full rounded"
        />
        {/* Dragging is a shortcut for the coordinate fields below, which also work by keyboard. */}
        {draft.map((box, index) => {
          const area = drawnArea(box, size);
          return (
            area && (
              <div
                key={box.key}
                data-annotation-box
                aria-hidden="true"
                className={`absolute border-2 border-primary ${saving ? "pointer-events-none" : "cursor-move"}`}
                style={area}
                onPointerDown={(event) => startDrag(event, box, "move")}
              >
                <span className="absolute top-0 left-0 max-w-full truncate bg-primary px-1 text-primary-foreground text-xs">
                  {index + 1}. {box.label}
                </span>
                <span
                  data-annotation-resize
                  className="absolute -right-1.5 -bottom-1.5 size-3 cursor-se-resize rounded-sm border border-background bg-primary"
                  onPointerDown={(event) => startDrag(event, box, "resize")}
                />
              </div>
            )
          );
        })}
      </div>
      <p className="text-sm">Predicción original: {predictionSummary}</p>
      <p className="text-muted-foreground text-sm">{savedSummary(item.reviewedAnnotations)}</p>
      <form noValidate className="space-y-3" onSubmit={(event) => void save(event)}>
        <p className="text-muted-foreground text-xs">
          Coordenadas en píxeles de la imagen ({item.imageWidth} × {item.imageHeight}): de 0 al
          ancho y al alto.
        </p>
        {draft.map((box, index) => (
          <fieldset key={box.key} disabled={saving} className="space-y-2 rounded-md border p-2">
            <legend className="px-1 text-sm">Caja {index + 1}</legend>
            <label htmlFor={`${id}-${box.key}-label`} className="block text-sm">
              Etiqueta
            </label>
            <Input
              id={`${id}-${box.key}-label`}
              value={box.label}
              required
              maxLength={DATASET_LABEL_MAX_LENGTH}
              list={`${id}-suggestions`}
              onChange={(event) => update(box.key, { label: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COORDINATES.map((coordinate) => (
                <div key={coordinate.name}>
                  <label
                    htmlFor={`${id}-${box.key}-${coordinate.name}`}
                    className="block text-muted-foreground text-xs"
                  >
                    {coordinate.label}
                  </label>
                  <Input
                    id={`${id}-${box.key}-${coordinate.name}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={size[coordinate.axis]}
                    step="any"
                    value={box[coordinate.name]}
                    onChange={(event) => update(box.key, { [coordinate.name]: event.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft((current) => current.filter((candidate) => candidate.key !== box.key))
                }
              >
                Eliminar caja
              </Button>
            </div>
          </fieldset>
        ))}
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || draft.length >= DATASET_ANNOTATIONS_MAX}
            onClick={addBox}
          >
            Agregar caja
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setDraft(initialDraft(item, nextKey));
              setError("");
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Guardando anotaciones…" : "Guardar anotaciones"}
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * The boxes to edit: the reviewed ones once saved, otherwise the prediction's,
 * so a person corrects what the model found instead of drawing from scratch.
 */
function initialDraft(
  item: Pick<DatasetItem, "reviewedAnnotations" | "originalResult" | "imageWidth" | "imageHeight">,
  nextKey: { current: number },
) {
  const size = { x: item.imageWidth, y: item.imageHeight };
  return (item.reviewedAnnotations ?? predictedAnnotations(item.originalResult)).map((annotation) =>
    toDraftBox(annotation, size, nextKey),
  );
}

function toDraftBox(
  { label, box }: DatasetAnnotation,
  size: { x: number; y: number },
  nextKey: { current: number },
): DraftBox {
  nextKey.current += 1;
  return {
    key: nextKey.current,
    label,
    xMin: toPixels(box.xMin, size.x),
    yMin: toPixels(box.yMin, size.y),
    xMax: toPixels(box.xMax, size.x),
    yMax: toPixels(box.yMax, size.y),
  };
}

/** A relative coordinate in pixels, rounded to hundredths to hide floating-point noise. */
function toPixels(relative: number, size: number) {
  return roundPixels(relative * size);
}

function roundPixels(value: number) {
  return String(Math.round(value * 100) / 100);
}

/** A typed pixel coordinate; a blank field is not a number, so it never passes as `0`. */
function pixels(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

/** The box's typed coordinates as numbers, or null while one of them is not a number. */
function numericBox(box: DraftBox) {
  const numbers = {
    xMin: pixels(box.xMin),
    yMin: pixels(box.yMin),
    xMax: pixels(box.xMax),
    yMax: pixels(box.yMax),
  };
  return Object.values(numbers).every(Number.isFinite) ? numbers : null;
}

function between(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Where a draft box is drawn over the image, in percentages, while it has an area. */
function drawnArea(box: DraftBox, size: { x: number; y: number }) {
  const xMin = clamp(pixels(box.xMin) / size.x);
  const yMin = clamp(pixels(box.yMin) / size.y);
  const xMax = clamp(pixels(box.xMax) / size.x);
  const yMax = clamp(pixels(box.yMax) / size.y);
  if (![xMin, yMin, xMax, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) {
    return null;
  }
  return {
    left: percent(xMin),
    top: percent(yMin),
    width: percent(xMax - xMin),
    height: percent(yMax - yMin),
  };
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function percent(value: number) {
  return `${Math.round(value * 10_000) / 100}%`;
}

function savedSummary(annotations: DatasetAnnotation[] | null) {
  if (annotations === null) return "Sin anotaciones revisadas";
  if (annotations.length === 0) return "Anotaciones revisadas: sin objetos";
  return `Anotaciones revisadas: ${annotations.length} ${annotations.length === 1 ? "caja" : "cajas"}`;
}

/**
 * The well-formed boxes of a detection prediction, as reviewed annotations to
 * start from, kept inside the image when the model placed an edge past it.
 */
function predictedAnnotations(result: Record<string, unknown>): DatasetAnnotation[] {
  if (result.type !== "detection" || !Array.isArray(result.detections)) return [];
  return result.detections.flatMap((detection: unknown) => {
    if (typeof detection !== "object" || detection === null) return [];
    const { label, box } = detection as { label?: unknown; box?: unknown };
    if (typeof label !== "string" || typeof box !== "object" || box === null) return [];
    const { xMin, yMin, xMax, yMax } = box as Record<string, unknown>;
    if (
      typeof xMin !== "number" ||
      typeof yMin !== "number" ||
      typeof xMax !== "number" ||
      typeof yMax !== "number"
    ) {
      return [];
    }
    return [
      {
        label,
        box: { xMin: clamp(xMin), yMin: clamp(yMin), xMax: clamp(xMax), yMax: clamp(yMax) },
      },
    ];
  });
}

/** The labels a detection prediction names, offered as suggestions for every box. */
function detectionLabels(result: Record<string, unknown>) {
  return [...new Set(predictedAnnotations(result).map(({ label }) => label))];
}
