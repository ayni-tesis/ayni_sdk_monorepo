// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMock, exportGetMock, getMock, patchMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  exportGetMock: vi.fn(),
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/lib/http-client", () => ({
  httpClient: {
    delete: deleteMock,
    get: (url: string, ...args: unknown[]) =>
      url.endsWith("/exports") ? exportGetMock(url, ...args) : getMock(url, ...args),
    patch: patchMock,
    post: postMock,
    put: putMock,
  },
}));

const { DatasetDetailView } = await import("./dataset-detail-view");

const application = {
  id: "app-1",
  name: "Invernos",
  status: "active" as const,
  organizationId: "org-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const dataset = {
  id: "dataset-1",
  applicationId: "app-1",
  name: "Flores",
  taskType: "classification" as const,
  createdAt: "2026-10-01T00:00:00.000Z",
  evidenceCount: 0,
  approvedCount: 0,
};

const filterOptions = {
  workflows: [{ id: "workflow-1", name: "Inspección" }],
  models: [{ id: "model-1", name: "Flores v1" }],
};

const evidence = {
  evidenceId: "evidence-1",
  modelId: "model-1",
  modelVersion: "1.0.0",
  taskType: "classification" as const,
  result: {
    type: "classification",
    label: "pino",
    confidence: 0.9,
    confidences: { pino: 0.9, cedro: 0.1 },
  },
  capturedAt: "2026-10-01T00:00:00.000Z",
};

const item = {
  id: "item-1",
  ...evidence,
  originalResult: evidence.result,
  addedAt: "2026-10-02T00:00:00.000Z",
  imageUrl: "https://evidence.example/image",
  imageWidth: 640,
  imageHeight: 480,
  reviewStatus: "pending" as const,
  reviewerName: null,
  reviewedAt: null,
  reviewReason: null,
  reviewedLabel: null as string | null,
  reviewedAnnotations: null,
};

function renderDetail(onBackToDatasets?: () => void) {
  return render(
    <DatasetDetailView
      application={application}
      datasetId="dataset-1"
      onBackToDatasets={onBackToDatasets}
    />,
  );
}

function renderManagedDetail() {
  return render(<DatasetDetailView application={application} datasetId="dataset-1" canManage />);
}

describe("DatasetDetailView", () => {
  beforeEach(() => {
    exportGetMock.mockReset().mockResolvedValue({ data: { exports: [] } });
    getMock
      .mockReset()
      .mockImplementation(async (url: string) =>
        url.endsWith("/available-evidence")
          ? { data: { evidence: [evidence], nextOffset: null } }
          : { data: { dataset, items: [], nextItemOffset: null, filterOptions } },
      );
    postMock.mockReset().mockResolvedValue({ data: { items: [item] } });
    deleteMock.mockReset().mockResolvedValue({ data: undefined });
    putMock.mockReset().mockImplementation(async (_url: string, body: { label: string }) => ({
      data: { reviewedLabel: body.label.trim() },
    }));
    patchMock.mockReset().mockResolvedValue({
      data: {
        status: "rejected",
        reviewerName: "Diego",
        reviewedAt: "2026-10-03T00:00:00.000Z",
        reason: "Imagen borrosa",
      },
    });
  });

  afterEach(() => cleanup());

  it("shows the dataset metadata and evidence and export tabs", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Flores" })).toBeInTheDocument();
    expect(screen.getByText("dataset-1")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay evidencias en este dataset.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Exportaciones" }));
    expect(screen.getByText("Aún no hay exportaciones para este dataset.")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(exportGetMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/exports",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("lets an administrator add selected evidence and shows its original prediction", async () => {
    let added = false;
    getMock.mockImplementation(async (url: string) =>
      url.endsWith("/available-evidence")
        ? { data: { evidence: [evidence], nextOffset: null } }
        : {
            data: added
              ? {
                  dataset: { ...dataset, evidenceCount: 1 },
                  items: [item],
                  nextItemOffset: null,
                  filterOptions,
                }
              : { dataset, items: [], nextItemOffset: null, filterOptions },
          },
    );
    postMock.mockImplementation(async () => {
      added = true;
      return { data: { items: [item] } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await userEvent.setup().click(screen.getByRole("checkbox"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar seleccionadas" }));

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.getByText("Evidencia agregada al dataset.")).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledWith("/applications/app-1/datasets/dataset-1/evidence", {
      evidenceIds: ["evidence-1"],
    });
  });

  it("shows the image and lets a workspace member reject evidence with an optional reason", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [item],
        nextItemOffset: null,
        filterOptions,
      },
    });
    renderDetail();
    expect(await screen.findByRole("img", { name: "Evidencia evidence-1" })).toHaveAttribute(
      "src",
      "https://evidence.example/image",
    );
    expect(screen.getByText("Estado: Pendiente")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    await user.type(screen.getByLabelText("Motivo opcional"), "Imagen borrosa");
    await user.click(screen.getByRole("button", { name: "Rechazar evidencia" }));

    expect(patchMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/review",
      { status: "rejected", reason: "Imagen borrosa" },
    );
    expect(await screen.findByText("Estado: Rechazada")).toBeInTheDocument();
    expect(screen.getByText("Evidencia rechazada.")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Imagen borrosa")).toBeInTheDocument();
    expect(screen.getByText(/Revisada por Diego/)).toBeInTheDocument();
  });

  it("saves a reviewed label apart from the read-only original prediction", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [item],
        nextItemOffset: null,
        filterOptions,
      },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    expect(within(panel).getByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(within(panel).getByText("Sin etiqueta revisada")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Anotaciones revisadas" })).not.toBeInTheDocument();
    const field = within(panel).getByLabelText("Etiqueta correcta");
    expect(field).toBeRequired();
    expect(
      Array.from(document.querySelectorAll(`#${field.getAttribute("list")} option`)).map((option) =>
        option.getAttribute("value"),
      ),
    ).toEqual(["pino", "cedro"]);

    const user = userEvent.setup();
    await user.type(field, " cedro ");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(putMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      { label: "cedro" },
    );
    expect(await screen.findByText("Etiqueta revisada guardada.")).toBeInTheDocument();
    expect(within(panel).getByText("Etiqueta revisada: cedro")).toBeInTheDocument();
    expect(within(panel).getByText("Predicción original: pino (90%)")).toBeInTheDocument();
  });

  it("rejects an empty label and keeps the previous reviewed label", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [{ ...item, reviewStatus: "approved" as const, reviewedLabel: "cedro" }],
        nextItemOffset: null,
        filterOptions,
      },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    const field = within(panel).getByLabelText("Etiqueta correcta");
    expect(field).toHaveValue("cedro");

    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, "   ");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "Ingresa una etiqueta para una evidencia aprobada.",
    );
    expect(putMock).not.toHaveBeenCalled();
    expect(within(panel).getByText("Etiqueta revisada: cedro")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Cancelar" }));
    expect(field).toHaveValue("cedro");
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server error when saving a label fails", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [item],
        nextItemOffset: null,
        filterOptions,
      },
    });
    putMock.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "No encontramos esta evidencia del dataset." } },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    const user = userEvent.setup();
    await user.type(within(panel).getByLabelText("Etiqueta correcta"), "cedro");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "No encontramos esta evidencia del dataset.",
    );
    expect(within(panel).getByText("Sin etiqueta revisada")).toBeInTheDocument();
  });

  it("shows labels and confidence from detection predictions", async () => {
    const detectionItem = {
      ...item,
      taskType: "detection" as const,
      result: {
        type: "detection",
        detections: [
          {
            label: "gato",
            confidence: 0.914,
            box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 },
          },
          {
            label: "perro",
            confidence: 0.718,
            box: { xMin: 0.5, yMin: 0.4, xMax: 0.7, yMax: 0.9 },
          },
        ],
      },
      originalResult: {
        type: "detection",
        detections: [
          {
            label: "gato",
            confidence: 0.914,
            box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 },
          },
          {
            label: "perro",
            confidence: 0.718,
            box: { xMin: 0.5, yMin: 0.4, xMax: 0.7, yMax: 0.9 },
          },
        ],
      },
    };
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, taskType: "detection", evidenceCount: 1 },
        items: [detectionItem],
        nextItemOffset: null,
        filterOptions,
      },
    });
    renderDetail();

    expect(
      await screen.findByText(
        "Predicción original: 2 detecciones: gato (91%; caja x 10–50%, y 20–60%), perro (72%; caja x 50–70%, y 40–90%)",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Etiqueta revisada" })).not.toBeInTheDocument();
  });

  describe("reviewed detection annotations", () => {
    const prediction = {
      type: "detection",
      detections: [
        { label: "gato", confidence: 0.914, box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 } },
        { label: "perro", confidence: 0.718, box: { xMin: 0.5, yMin: 0.4, xMax: 0.7, yMax: 0.9 } },
      ],
    };
    const detectionItem = {
      ...item,
      taskType: "detection" as const,
      result: prediction,
      originalResult: prediction,
      reviewedAnnotations: null as
        | { label: string; box: { xMin: number; yMin: number; xMax: number; yMax: number } }[]
        | null,
    };

    function renderDetection(reviewedAnnotations: typeof detectionItem.reviewedAnnotations) {
      getMock.mockResolvedValue({
        data: {
          dataset: { ...dataset, taskType: "detection", evidenceCount: 1 },
          items: [{ ...detectionItem, reviewedAnnotations }],
          nextItemOffset: null,
          filterOptions,
        },
      });
      putMock.mockImplementation(
        async (_url: string, body: { annotations: typeof detectionItem.reviewedAnnotations }) => ({
          data: { reviewedAnnotations: body.annotations },
        }),
      );
      renderDetail();
      return screen.findByRole("region", { name: "Anotaciones revisadas" });
    }

    function box(panel: HTMLElement, index: number) {
      return within(within(panel).getByRole("group", { name: `Caja ${index}` }));
    }

    it("corrects the predicted boxes apart from the read-only original prediction", async () => {
      const panel = await renderDetection(null);
      expect(
        within(panel).getByText(
          "Predicción original: 2 detecciones: gato (91%; caja x 10–50%, y 20–60%), perro (72%; caja x 50–70%, y 40–90%)",
        ),
      ).toBeInTheDocument();
      expect(within(panel).getByText("Sin anotaciones revisadas")).toBeInTheDocument();
      expect(
        within(panel).getByText(/Coordenadas en píxeles de la imagen \(640 × 480\)/),
      ).toBeInTheDocument();
      // The draft starts from the prediction, converted to pixels of the image.
      expect(box(panel, 1).getByLabelText("Etiqueta")).toHaveValue("gato");
      expect(box(panel, 1).getByLabelText("X mínima")).toHaveValue(64);
      expect(box(panel, 1).getByLabelText("Y mínima")).toHaveValue(96);
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(320);
      expect(box(panel, 1).getByLabelText("Y máxima")).toHaveValue(288);
      expect(panel.querySelectorAll("[data-annotation-box]")).toHaveLength(2);

      const user = userEvent.setup();
      await user.clear(box(panel, 1).getByLabelText("Etiqueta"));
      await user.type(box(panel, 1).getByLabelText("Etiqueta"), "lince");
      await user.click(box(panel, 2).getByRole("button", { name: "Eliminar caja" }));
      expect(within(panel).queryByRole("group", { name: "Caja 2" })).not.toBeInTheDocument();
      const drawn = panel.querySelectorAll<HTMLElement>("[data-annotation-box]");
      expect(drawn).toHaveLength(1);
      expect(drawn[0]).toHaveStyle({ left: "10%", top: "20%", width: "40%", height: "40%" });
      expect(drawn[0]).toHaveTextContent("1. lince");
      await user.click(within(panel).getByRole("button", { name: "Guardar anotaciones" }));

      expect(putMock).toHaveBeenCalledWith(
        "/applications/app-1/datasets/dataset-1/evidence/item-1/annotations",
        { annotations: [{ label: "lince", box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 } }] },
      );
      expect(await screen.findByText("Anotaciones revisadas guardadas.")).toBeInTheDocument();
      expect(within(panel).getByText("Anotaciones revisadas: 1 caja")).toBeInTheDocument();
      expect(within(panel).getByText(/^Predicción original: 2 detecciones/)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Etiqueta revisada" })).not.toBeInTheDocument();
    });

    it("rejects a box outside the image and keeps the previous annotations", async () => {
      const panel = await renderDetection([
        { label: "gato", box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 } },
      ]);
      expect(within(panel).getByText("Anotaciones revisadas: 1 caja")).toBeInTheDocument();
      expect(within(panel).queryByRole("group", { name: "Caja 2" })).not.toBeInTheDocument();

      const user = userEvent.setup();
      const xMax = box(panel, 1).getByLabelText("X máxima");
      await user.clear(xMax);
      await user.type(xMax, "700");
      await user.click(within(panel).getByRole("button", { name: "Guardar anotaciones" }));

      expect(within(panel).getByRole("alert")).toHaveTextContent(
        "La caja debe permanecer dentro de la imagen.",
      );
      expect(putMock).not.toHaveBeenCalled();
      expect(within(panel).getByText("Anotaciones revisadas: 1 caja")).toBeInTheDocument();

      await user.click(within(panel).getByRole("button", { name: "Cancelar" }));
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(320);
      expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("adds a labeled box and saves an image without objects", async () => {
      const panel = await renderDetection([]);
      expect(within(panel).getByText("Anotaciones revisadas: sin objetos")).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(within(panel).getByRole("button", { name: "Agregar caja" }));
      expect(box(panel, 1).getByLabelText("Etiqueta")).toHaveValue("");
      expect(box(panel, 1).getByLabelText("X mínima")).toHaveValue(160);
      expect(box(panel, 1).getByLabelText("Y máxima")).toHaveValue(360);
      await user.click(within(panel).getByRole("button", { name: "Guardar anotaciones" }));
      expect(within(panel).getByRole("alert")).toHaveTextContent(
        "Ingresa una etiqueta para cada caja.",
      );
      expect(putMock).not.toHaveBeenCalled();

      await user.type(box(panel, 1).getByLabelText("Etiqueta"), "perro");
      await user.click(within(panel).getByRole("button", { name: "Guardar anotaciones" }));
      expect(putMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1/evidence/item-1/annotations",
        {
          annotations: [
            { label: "perro", box: { xMin: 0.25, yMin: 0.25, xMax: 0.75, yMax: 0.75 } },
          ],
        },
      );
      expect(await within(panel).findByText("Anotaciones revisadas: 1 caja")).toBeInTheDocument();
    });

    it("shows the server error when saving annotations fails", async () => {
      const panel = await renderDetection(null);
      putMock.mockRejectedValue({
        isAxiosError: true,
        response: { data: { message: "Esta evidencia no es de detección." } },
      });
      await userEvent
        .setup()
        .click(within(panel).getByRole("button", { name: "Guardar anotaciones" }));

      expect(await within(panel).findByRole("alert")).toHaveTextContent(
        "Esta evidencia no es de detección.",
      );
      expect(within(panel).getByText("Sin anotaciones revisadas")).toBeInTheDocument();
    });

    it("moves and resizes a box by dragging it, without leaving the image", async () => {
      const panel = await renderDetection(null);
      const [first] = panel.querySelectorAll<HTMLElement>("[data-annotation-box]");
      const frame = first?.parentElement;
      if (!first || !frame) throw new Error("The boxes are not drawn over the image");
      // The 640 × 480 image is drawn at half size, so one screen pixel is two image pixels.
      vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 240 }),
      );

      fireEvent.pointerDown(first, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(frame, { pointerId: 1, clientX: 110, clientY: 90 });
      fireEvent.pointerUp(frame, { pointerId: 1 });
      expect(box(panel, 1).getByLabelText("X mínima")).toHaveValue(84);
      expect(box(panel, 1).getByLabelText("Y mínima")).toHaveValue(76);
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(340);
      expect(box(panel, 1).getByLabelText("Y máxima")).toHaveValue(268);

      const handle = first.querySelector<HTMLElement>("[data-annotation-resize]");
      if (!handle) throw new Error("The box has no resize handle");
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(frame, { pointerId: 1, clientX: 1000, clientY: 1000 });
      fireEvent.pointerUp(frame, { pointerId: 1 });
      fireEvent.pointerMove(frame, { pointerId: 1, clientX: 0, clientY: 0 });
      expect(box(panel, 1).getByLabelText("X mínima")).toHaveValue(84);
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(640);
      expect(box(panel, 1).getByLabelText("Y máxima")).toHaveValue(480);
      expect(box(panel, 2).getByLabelText("X mínima")).toHaveValue(320);
    });

    it("keeps a resized box inside the image when its edge is near the border", async () => {
      const panel = await renderDetection(null);
      const user = userEvent.setup();
      // A half-pixel box at the bottom-right corner: shrinking it cannot keep
      // one pixel of size, so it must stay at the image edge instead.
      for (const [label, value] of [
        ["X máxima", "640"],
        ["Y máxima", "480"],
        ["X mínima", "639.5"],
        ["Y mínima", "479.5"],
      ] as const) {
        await user.clear(box(panel, 1).getByLabelText(label));
        await user.type(box(panel, 1).getByLabelText(label), value);
      }
      const [first] = panel.querySelectorAll<HTMLElement>("[data-annotation-box]");
      const frame = first?.parentElement;
      const handle = first?.querySelector<HTMLElement>("[data-annotation-resize]");
      if (!first || !frame || !handle) throw new Error("The boxes are not drawn over the image");
      vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 240 }),
      );

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(frame, { pointerId: 1, clientX: 90, clientY: 90 });
      fireEvent.pointerUp(frame, { pointerId: 1 });
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(640);
      expect(box(panel, 1).getByLabelText("Y máxima")).toHaveValue(480);
    });

    it("starts from predicted boxes kept inside the image", async () => {
      getMock.mockResolvedValue({
        data: {
          dataset: { ...dataset, taskType: "detection", evidenceCount: 1 },
          items: [
            {
              ...detectionItem,
              originalResult: {
                type: "detection",
                detections: [
                  {
                    label: "gato",
                    confidence: 0.9,
                    box: { xMin: -0.01, yMin: 0.5, xMax: 1.02, yMax: 1 },
                  },
                ],
              },
            },
          ],
          nextItemOffset: null,
          filterOptions,
        },
      });
      renderDetail();
      const panel = await screen.findByRole("region", { name: "Anotaciones revisadas" });

      expect(box(panel, 1).getByLabelText("X mínima")).toHaveValue(0);
      expect(box(panel, 1).getByLabelText("X máxima")).toHaveValue(640);
    });

    it("keeps unsaved box edits when the detail reloads after adding evidence", async () => {
      const otherEvidence = {
        ...evidence,
        evidenceId: "evidence-2",
        taskType: "detection" as const,
        result: prediction,
      };
      let added = false;
      getMock.mockImplementation(async (url: string) =>
        url.endsWith("/available-evidence")
          ? { data: { evidence: [otherEvidence], nextOffset: null } }
          : {
              // Every load builds new objects, as a real response does.
              data: structuredClone({
                dataset: { ...dataset, taskType: "detection", evidenceCount: added ? 2 : 1 },
                items: added
                  ? [
                      detectionItem,
                      {
                        ...detectionItem,
                        ...otherEvidence,
                        id: "item-2",
                        originalResult: prediction,
                      },
                    ]
                  : [detectionItem],
                nextItemOffset: null,
                filterOptions,
              }),
            },
      );
      postMock.mockImplementation(async () => {
        added = true;
        return { data: { items: [] } };
      });
      renderManagedDetail();
      const user = userEvent.setup();
      const [panel] = await screen.findAllByRole("region", { name: "Anotaciones revisadas" });
      if (!panel) throw new Error("The annotations panel is missing");
      await user.clear(box(panel, 1).getByLabelText("Etiqueta"));
      await user.type(box(panel, 1).getByLabelText("Etiqueta"), "lince");

      await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Agregar seleccionadas" }));
      expect(await screen.findByText("Evidencia agregada al dataset.")).toBeInTheDocument();

      // The closing dialog keeps the page aria-hidden for a moment in jsdom.
      await waitFor(() =>
        expect(screen.getAllByRole("region", { name: "Anotaciones revisadas" })).toHaveLength(2),
      );
      const [reloaded] = screen.getAllByRole("region", { name: "Anotaciones revisadas" });
      expect(box(reloaded as HTMLElement, 1).getByLabelText("Etiqueta")).toHaveValue("lince");
    });
  });

  it("does not show a stale review success after the item was retired", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [item],
        nextItemOffset: null,
        filterOptions,
      },
    });
    let resolveReview!: (response: {
      data: {
        status: "approved";
        reviewerName: string;
        reviewedAt: string;
        reason: null;
      };
    }) => void;
    patchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReview = resolve;
        }),
    );
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));
    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();

    await act(async () => {
      resolveReview({
        data: {
          status: "approved",
          reviewerName: "Diego",
          reviewedAt: "2026-10-03T00:00:00.000Z",
          reason: null,
        },
      });
    });

    expect(screen.queryByText("Evidencia aprobada.")).not.toBeInTheDocument();
    expect(screen.queryByText("Predicción original: pino (90%)")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("does not duplicate newly added evidence when loading later dataset pages", async () => {
    const user = userEvent.setup();
    const existingItems = Array.from({ length: 55 }, (_, index) => ({
      ...item,
      id: `item-${index}`,
      evidenceId: `evidence-${index}`,
      originalResult: {
        type: "classification" as const,
        label: `existente-${index}`,
        confidence: 0.9,
      },
    }));
    const addedItem = {
      ...item,
      id: "item-new",
      evidenceId: "evidence-new",
      originalResult: { type: "classification" as const, label: "nueva", confidence: 0.9 },
    };
    const updatedDataset = { ...dataset, evidenceCount: 56 };
    let added = false;
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      if (options?.params?.offset === 50) {
        return {
          data: {
            dataset: updatedDataset,
            items: [...existingItems.slice(50), addedItem],
            nextItemOffset: null,
            filterOptions,
          },
        };
      }
      return {
        data: {
          dataset: added ? updatedDataset : { ...dataset, evidenceCount: 55 },
          items: existingItems.slice(0, 50),
          nextItemOffset: 50,
          filterOptions,
        },
      };
    });
    postMock.mockImplementation(async () => {
      added = true;
      return { data: { items: [addedItem] } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agregar seleccionadas" }));

    expect(await screen.findByText("Evidencia agregada al dataset.")).toBeInTheDocument();
    expect(screen.queryByText("Predicción original: nueva (90%)")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"), {
      timeout: 4_000,
    });
    await user.click(
      await screen.findByRole("button", { name: "Cargar más evidencias del dataset" }),
    );

    expect(screen.getAllByText("Predicción original: nueva (90%)")).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 50 } }),
    );
  }, 20_000);

  it("lets administrators retire a dataset item while preserving its source evidence", async () => {
    let removed = false;
    getMock.mockImplementation(async (url: string) =>
      url.endsWith("/available-evidence")
        ? { data: { evidence: [evidence], nextOffset: null } }
        : {
            data: removed
              ? {
                  dataset: { ...dataset, evidenceCount: 0 },
                  items: [],
                  nextItemOffset: null,
                  filterOptions,
                }
              : {
                  dataset: { ...dataset, evidenceCount: 1 },
                  items: [item],
                  nextItemOffset: null,
                  filterOptions,
                },
          },
    );
    deleteMock.mockImplementation(async () => {
      removed = true;
      return { data: undefined };
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    expect(
      screen.getByText("La evidencia se conservará, pero no se incluirá en futuras exportaciones."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();
    await screen.findByRole("button", { name: "Agregar evidencia" });
    expect(screen.getByText("Aún no hay evidencias en este dataset.")).toBeInTheDocument();
    expect(deleteMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1",
    );
    await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
    expect(await screen.findByText("Predicción: pino (90%)")).toBeInTheDocument();
  });

  it("retires an item from a later page without discarding loaded items or reloading the detail", async () => {
    const olderItem = {
      ...item,
      id: "item-2",
      evidenceId: "evidence-2",
      originalResult: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    const laterItem = {
      ...item,
      id: "item-3",
      evidenceId: "evidence-3",
      originalResult: { type: "classification", label: "roble", confidence: 0.6 },
    };
    let removed = false;
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      if (options?.params?.offset === 1 && removed) {
        return {
          data: {
            dataset: { ...dataset, evidenceCount: 2 },
            items: [laterItem],
            nextItemOffset: null,
            filterOptions,
          },
        };
      }
      if (options?.params?.offset === 1) {
        return {
          data: {
            dataset: { ...dataset, evidenceCount: 3 },
            items: [olderItem],
            nextItemOffset: 2,
            filterOptions,
          },
        };
      }
      return {
        data: {
          dataset: { ...dataset, evidenceCount: 3 },
          items: [item],
          nextItemOffset: 1,
          filterOptions,
        },
      };
    });
    deleteMock.mockImplementation(async () => {
      removed = true;
      return { data: undefined };
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));
    expect(await screen.findByText("Predicción original: cedro (70%)")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Retirar del dataset" });
    expect(removeButtons).toHaveLength(2);
    const laterItemRemoveButton = removeButtons[1];
    if (!laterItemRemoveButton) throw new Error("Expected a remove button for the later page");
    await user.click(laterItemRemoveButton);
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();
    expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.queryByText("Predicción original: cedro (70%)")).not.toBeInTheDocument();
    expect(screen.getByText("Evidencias", { selector: "dt" }).nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Cargando dataset…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));
    expect(await screen.findByText("Predicción original: roble (60%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenLastCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 1 } }),
    );
  });

  it("keeps the dataset item and shows a missing-item error when retirement fails", async () => {
    getMock.mockResolvedValue({
      data: { dataset, items: [item], nextItemOffset: null, filterOptions },
    });
    deleteMock.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "No encontramos este ítem del dataset." } },
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos este ítem del dataset.",
    );
    expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
  });

  it("does not offer retirement to workspace members", async () => {
    getMock.mockResolvedValue({
      data: { dataset, items: [item], nextItemOffset: null, filterOptions },
    });
    renderDetail();

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar del dataset" })).not.toBeInTheDocument();
  });

  it("loads additional compatible evidence pages on demand", async () => {
    const olderEvidence = {
      ...evidence,
      evidenceId: "evidence-2",
      result: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return options?.params?.offset
          ? { data: { evidence: [olderEvidence], nextOffset: null } }
          : { data: { evidence: [evidence], nextOffset: 50 } };
      }
      return { data: { dataset, items: [], filterOptions } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cargar más evidencias" }));

    expect(await screen.findByText("Predicción: cedro (70%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/available-evidence",
      expect.objectContaining({ params: { offset: 50 } }),
    );
  });

  it("loads additional attached evidence pages on demand", async () => {
    const olderItem = {
      ...item,
      id: "item-2",
      evidenceId: "evidence-2",
      originalResult: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      return options?.params?.offset
        ? { data: { dataset, items: [olderItem], nextItemOffset: null, filterOptions } }
        : { data: { dataset, items: [item], nextItemOffset: 1, filterOptions } };
    });
    renderDetail();

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

    expect(await screen.findByText("Predicción original: cedro (70%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 1 } }),
    );
  });

  it("shows loading, not-found, and retryable error states", async () => {
    getMock.mockReturnValueOnce(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText("Cargando dataset…")).toBeInTheDocument();
    cleanup();

    getMock.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
    renderDetail();
    expect(await screen.findByText("No encontramos este dataset.")).toBeInTheDocument();
    cleanup();

    getMock.mockRejectedValueOnce(new Error("offline"));
    renderDetail();
    expect(await screen.findByText("No pudimos cargar el dataset.")).toBeInTheDocument();
    getMock.mockResolvedValueOnce({
      data: { dataset, items: [], nextItemOffset: null, filterOptions },
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Flores" })).toBeInTheDocument();
  });

  describe("Filtrar evidencias (US-083)", () => {
    const approvedItem = {
      ...item,
      id: "item-2",
      evidenceId: "evidence-2",
      originalResult: { type: "classification", label: "cedro", confidence: 0.7 },
      reviewStatus: "approved" as const,
      reviewedAt: "2026-10-03T00:00:00.000Z",
    };
    const laterApprovedItem = {
      ...approvedItem,
      id: "item-3",
      evidenceId: "evidence-3",
      originalResult: { type: "classification", label: "roble", confidence: 0.6 },
    };
    const appliedFilters = {
      status: "approved",
      workflowId: "workflow-1",
      modelId: "model-1",
      capturedFrom: "2026-10-01",
      capturedTo: "2026-10-03",
      minConfidence: 0.5,
      maxConfidence: 0.9,
    };

    function filterBar() {
      return within(screen.getByRole("form", { name: "Filtrar evidencias" }));
    }

    it("asks the server for the filtered evidence and keeps the filters on later pages", async () => {
      getMock.mockImplementation(
        async (_url: string, options?: { params?: Record<string, unknown> }) => {
          if (!options?.params?.status) {
            return { data: { dataset, items: [item], nextItemOffset: null, filterOptions } };
          }
          return options.params.offset === 1
            ? { data: { dataset, items: [laterApprovedItem], nextItemOffset: null, filterOptions } }
            : { data: { dataset, items: [approvedItem], nextItemOffset: 1, filterOptions } };
        },
      );
      const user = userEvent.setup();
      renderDetail();
      expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();

      const bar = filterBar();
      await user.selectOptions(bar.getByLabelText("Estado"), "Aprobada");
      await user.selectOptions(bar.getByLabelText("Workflow"), "Inspección");
      await user.selectOptions(bar.getByLabelText("Modelo"), "Flores v1");
      const date = within(bar.getByRole("group", { name: "Fecha" }));
      fireEvent.change(date.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
      fireEvent.change(date.getByLabelText("Hasta"), { target: { value: "2026-10-03" } });
      const confidence = within(bar.getByRole("group", { name: "Confianza" }));
      await user.type(confidence.getByLabelText("Mínima (%)"), "50");
      await user.type(confidence.getByLabelText("Máxima (%)"), "90");
      await user.click(bar.getByRole("button", { name: "Aplicar filtros" }));

      expect(await screen.findByText("Predicción original: cedro (70%)")).toBeInTheDocument();
      expect(screen.queryByText("Predicción original: pino (90%)")).not.toBeInTheDocument();
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: appliedFilters }),
      );

      await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

      expect(await screen.findByText("Predicción original: roble (60%)")).toBeInTheDocument();
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { ...appliedFilters, offset: 1 } }),
      );
    });

    it("says when no evidence matches and clears the filters", async () => {
      getMock.mockImplementation(
        async (_url: string, options?: { params?: { status?: string } }) =>
          options?.params?.status
            ? { data: { dataset, items: [], nextItemOffset: null, filterOptions } }
            : { data: { dataset, items: [item], nextItemOffset: null, filterOptions } },
      );
      const user = userEvent.setup();
      renderDetail();
      await screen.findByText("Predicción original: pino (90%)");

      await user.selectOptions(filterBar().getByLabelText("Estado"), "Rechazada");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));

      expect(
        await screen.findByText("No hay evidencias que coincidan con los filtros."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Aún no hay evidencias en este dataset.")).not.toBeInTheDocument();

      await user.click(filterBar().getByRole("button", { name: "Limpiar filtros" }));

      expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
      expect(filterBar().getByLabelText("Estado")).toHaveValue("");
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: {} }),
      );
    });

    it("does not skip filtered evidence after a review takes an item out of the status filter", async () => {
      getMock.mockImplementation(
        async (_url: string, options?: { params?: Record<string, unknown> }) =>
          options?.params?.status && options.params.offset === undefined
            ? { data: { dataset, items: [item], nextItemOffset: 1, filterOptions } }
            : { data: { dataset, items: [], nextItemOffset: null, filterOptions } },
      );
      patchMock.mockResolvedValue({
        data: {
          status: "approved",
          reviewerName: "Diego",
          reviewedAt: "2026-10-03T00:00:00.000Z",
          reason: null,
        },
      });
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole("heading", { name: "Flores" });

      await user.selectOptions(filterBar().getByLabelText("Estado"), "Pendiente");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));
      await screen.findByText("Predicción original: pino (90%)");
      await user.click(screen.getByRole("button", { name: "Aprobar" }));
      expect(await screen.findByText("Evidencia aprobada.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { status: "pending", offset: 0 } }),
      );
    });

    const secondApprovedItem = {
      ...approvedItem,
      id: "item-4",
      evidenceId: "evidence-4",
      originalResult: { type: "classification", label: "ciprés", confidence: 0.8 },
    };

    /** Clicks the button with this name in the first item, the one the review flow acts on. */
    async function clickFirst(user: ReturnType<typeof userEvent.setup>, name: string) {
      const [button] = screen.getAllByRole("button", { name });
      if (!button) throw new Error(`Expected a "${name}" button`);
      await user.click(button);
    }

    function mockFilteredApprovedPages() {
      getMock.mockImplementation(
        async (_url: string, options?: { params?: Record<string, unknown> }) => {
          if (!options?.params?.status) {
            return { data: { dataset, items: [item], nextItemOffset: null, filterOptions } };
          }
          return options.params.offset === undefined
            ? {
                data: {
                  dataset,
                  items: [approvedItem, secondApprovedItem],
                  nextItemOffset: 2,
                  filterOptions,
                },
              }
            : {
                data: { dataset, items: [laterApprovedItem], nextItemOffset: null, filterOptions },
              };
        },
      );
      patchMock.mockImplementation(async (_url: string, body: { status: string }) => ({
        data: {
          status: body.status,
          reviewerName: "Diego",
          reviewedAt: "2026-10-04T00:00:00.000Z",
          reason: null,
        },
      }));
    }

    async function filterApprovedAndReject(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByText("Predicción original: pino (90%)");
      await user.selectOptions(filterBar().getByLabelText("Estado"), "Aprobada");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));
      await screen.findByText("Predicción original: cedro (70%)");
      await clickFirst(user, "Rechazar");
      await user.click(screen.getByRole("button", { name: "Rechazar evidencia" }));
      expect(await screen.findByText("Evidencia rechazada.")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"), {
        timeout: 4_000,
      });
    }

    it("counts an item again when a later review brings it back into the status filter", async () => {
      mockFilteredApprovedPages();
      const user = userEvent.setup();
      renderDetail();
      await filterApprovedAndReject(user);

      await clickFirst(user, "Aprobar");
      expect(await screen.findByText("Evidencia aprobada.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

      expect(await screen.findByText("Predicción original: roble (60%)")).toBeInTheDocument();
      expect(screen.getAllByText("Predicción original: cedro (70%)")).toHaveLength(1);
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { status: "approved", offset: 2 } }),
      );
    });

    it("does not move the page back twice when retiring an item that already left the filter", async () => {
      mockFilteredApprovedPages();
      const user = userEvent.setup();
      renderManagedDetail();
      await filterApprovedAndReject(user);

      await clickFirst(user, "Retirar del dataset");
      await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));
      expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

      expect(await screen.findByText("Predicción original: roble (60%)")).toBeInTheDocument();
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { status: "approved", offset: 1 } }),
      );
    });

    it("does not load another page of the previous filters while new filters load", async () => {
      getMock
        .mockResolvedValueOnce({
          data: { dataset, items: [item], nextItemOffset: 1, filterOptions },
        })
        .mockReturnValueOnce(new Promise(() => {}));
      const user = userEvent.setup();
      renderDetail();
      await screen.findByText("Predicción original: pino (90%)");

      await user.selectOptions(filterBar().getByLabelText("Estado"), "Aprobada");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));

      expect(filterBar().getByRole("button", { name: "Aplicando filtros…" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Cargar más evidencias del dataset" }),
      ).toBeDisabled();
    });

    it("keeps showing the applied filters after the detail reloads from an error", async () => {
      let detailCalls = 0;
      getMock.mockImplementation(
        async (url: string, options?: { params?: Record<string, unknown> }) => {
          if (url.endsWith("/available-evidence")) {
            return { data: { evidence: [evidence], nextOffset: null } };
          }
          detailCalls += 1;
          if (detailCalls === 3) throw new Error("offline");
          return {
            data: {
              dataset,
              items: options?.params?.status ? [] : [item],
              nextItemOffset: null,
              filterOptions,
            },
          };
        },
      );
      const user = userEvent.setup();
      renderManagedDetail();
      await screen.findByText("Predicción original: pino (90%)");
      await user.selectOptions(filterBar().getByLabelText("Estado"), "Rechazada");
      await user.type(filterBar().getByLabelText("Mínima (%)"), "29");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));
      await screen.findByText("No hay evidencias que coincidan con los filtros.");

      await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Agregar seleccionadas" }));
      await user.click(await screen.findByRole("button", { name: "Reintentar" }));

      expect(
        await screen.findByText("No hay evidencias que coincidan con los filtros."),
      ).toBeInTheDocument();
      expect(filterBar().getByLabelText("Estado")).toHaveValue("rejected");
      expect(filterBar().getByLabelText("Mínima (%)")).toHaveValue(29);
      expect(getMock).toHaveBeenLastCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { status: "rejected", minConfidence: 0.29 } }),
      );
    }, 20_000);

    it("rejects an invalid filter without asking the server or changing the evidence shown", async () => {
      getMock.mockResolvedValue({
        data: { dataset, items: [item], nextItemOffset: null, filterOptions },
      });
      const user = userEvent.setup();
      renderDetail();
      await screen.findByText("Predicción original: pino (90%)");
      const confidence = within(filterBar().getByRole("group", { name: "Confianza" }));

      await user.type(confidence.getByLabelText("Mínima (%)"), "90");
      await user.type(confidence.getByLabelText("Máxima (%)"), "10");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));

      expect(await filterBar().findByRole("alert")).toHaveTextContent(
        "No se pudo aplicar uno de los filtros.",
      );
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
    });

    it("keeps the evidence shown when the server rejects a filter", async () => {
      getMock
        .mockResolvedValueOnce({
          data: { dataset, items: [item], nextItemOffset: null, filterOptions },
        })
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: {
            status: 400,
            data: {
              message: "No se pudo aplicar uno de los filtros.",
              code: "invalidDatasetFilter",
            },
          },
        });
      const user = userEvent.setup();
      renderDetail();
      await screen.findByText("Predicción original: pino (90%)");

      await user.selectOptions(filterBar().getByLabelText("Workflow"), "Inspección");
      await user.click(filterBar().getByRole("button", { name: "Aplicar filtros" }));

      expect(await filterBar().findByRole("alert")).toHaveTextContent(
        "No se pudo aplicar uno de los filtros.",
      );
      expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Flores" })).toBeInTheDocument();
    });
  });

  describe("Validar dataset (US-084)", () => {
    const validationUrl = "/applications/app-1/datasets/dataset-1/validation";
    const approvedItem = {
      ...item,
      reviewStatus: "approved" as const,
      reviewedAt: "2026-10-03T00:00:00.000Z",
      reviewedLabel: "pino",
    };
    const unlabeledItem = {
      ...approvedItem,
      id: "item-2",
      evidenceId: "evidence-2",
      reviewedLabel: null,
    };
    const invalidValidation = {
      ready: false,
      approvedCount: 2,
      problem: null,
      invalidItemCount: 1,
      invalidItems: [
        {
          itemId: "item-2",
          evidenceId: "evidence-2",
          imageUrl: "https://evidence.example/image-2",
          imageWidth: 640,
          imageHeight: 480,
          cause: {
            code: "reviewedLabelRequired",
            message: "La evidencia aprobada no tiene etiqueta revisada.",
          },
        },
      ],
    };

    /** Answers the detail with `pages` (by filter status and offset) and the validation with `validation`. */
    function serve(
      validation: () => Promise<unknown>,
      pages: Record<string, { items: unknown[]; nextItemOffset: number | null }> = {
        "": { items: [approvedItem], nextItemOffset: null },
      },
      directItems: Record<string, unknown> = {},
    ) {
      getMock.mockImplementation(
        async (url: string, options?: { params?: { status?: string; offset?: number } }) => {
          if (url === validationUrl) return { data: await validation() };
          if (url in directItems) return { data: directItems[url] };
          const key = `${options?.params?.status ?? ""}${options?.params?.offset ?? ""}`;
          const page = pages[key] ?? { items: [], nextItemOffset: null };
          return { data: { dataset, filterOptions, ...page } };
        },
      );
    }

    async function validate() {
      const user = userEvent.setup();
      renderDetail();
      await screen.findByRole("heading", { name: "Flores" });
      await user.click(screen.getByRole("tab", { name: "Exportaciones" }));
      await user.click(screen.getByRole("button", { name: "Validar dataset" }));
      return user;
    }

    async function openDetectionExportDialog() {
      const detectionDataset = { ...dataset, taskType: "detection" as const };
      getMock.mockImplementation(async (url: string) =>
        url === validationUrl
          ? {
              data: {
                ready: true,
                approvedCount: 2,
                annotationCount: 1,
                categoryCount: 1,
                problem: null,
                invalidItemCount: 0,
                invalidItems: [],
              },
            }
          : { data: { dataset: detectionDataset, items: [], nextItemOffset: null, filterOptions } },
      );
      const user = userEvent.setup();
      renderManagedDetail();
      await screen.findByRole("heading", { name: "Flores" });
      await user.click(screen.getByRole("tab", { name: "Exportaciones" }));
      await user.click(screen.getByRole("button", { name: "Nueva exportación" }));
      await screen.findByRole("dialog", { name: "Nueva exportación" });
      return user;
    }

    it("lets any member confirm that the dataset is ready to export", async () => {
      let resolve: (value: unknown) => void = () => {};
      serve(() => new Promise((done) => (resolve = done)));
      await validate();

      expect(screen.getByRole("button", { name: "Validando dataset…" })).toBeDisabled();
      resolve({
        ready: true,
        approvedCount: 1,
        problem: null,
        invalidItemCount: 0,
        invalidItems: [],
      });

      expect(await screen.findByText("El dataset está listo para exportarse.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Validar dataset" })).toBeEnabled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(getMock).toHaveBeenCalledWith(
        validationUrl,
        expect.objectContaining({
          params: { format: "classification_images_csv" },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("validates the selected YOLO format in the summary and validation request", async () => {
      const user = await openDetectionExportDialog();

      await user.click(screen.getByRole("button", { name: "Detección (YOLO)" }));
      await waitFor(() =>
        expect(getMock).toHaveBeenLastCalledWith(
          validationUrl,
          expect.objectContaining({ params: { format: "detection_yolo" } }),
        ),
      );
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"), {
        timeout: 4_000,
      });
      await user.click(screen.getByRole("button", { name: "Validar dataset" }));

      expect(await screen.findByText("El dataset está listo para exportarse.")).toBeInTheDocument();
      expect(getMock).toHaveBeenLastCalledWith(
        validationUrl,
        expect.objectContaining({
          params: { format: "detection_yolo" },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it.each([
      [
        "datasetExportNeedsTwoItems",
        "Se necesitan al menos dos imágenes aprobadas para separar train y val.",
      ],
      [
        "datasetExportNoYoloClasses",
        "Agrega al menos una anotación revisada con una clase para exportar en YOLO.",
      ],
      ["datasetExportInvalidAnnotations", "Corrige las anotaciones indicadas antes de exportar."],
    ])("shows the specific YOLO export error %s", async (code, message) => {
      postMock.mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { code, invalidItemCount: 0, invalidItems: [] } },
      });
      const user = await openDetectionExportDialog();
      await user.click(screen.getByRole("button", { name: "Detección (YOLO)" }));
      const generateButton = await screen.findByRole("button", {
        name: "Generar exportación YOLO",
      });
      await waitFor(() => expect(generateButton).toBeEnabled());
      await user.click(generateButton);

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    });

    it("lists each item that requires review with its image and cause", async () => {
      serve(async () => invalidValidation);
      await validate();

      const dialog = within(
        await screen.findByRole("dialog", { name: "Ítems que requieren revisión" }),
      );
      expect(dialog.getByRole("img", { name: "Evidencia evidence-2" })).toHaveAttribute(
        "src",
        "https://evidence.example/image-2",
      );
      expect(
        dialog.getByText("La evidencia aprobada no tiene etiqueta revisada."),
      ).toBeInTheDocument();
      expect(dialog.getByRole("link", { name: "Revisar evidencia" })).toBeInTheDocument();
      expect(screen.queryByText("El dataset está listo para exportarse.")).not.toBeInTheDocument();
    });

    it("says how many of the items it lists", async () => {
      serve(async () => ({ ...invalidValidation, invalidItemCount: 120 }));
      await validate();

      expect(
        await screen.findByText("Se muestran los primeros 1 de 120 ítems que requieren revisión."),
      ).toBeInTheDocument();
    });

    it("reports a dataset without approved items", async () => {
      serve(async () => ({
        ready: false,
        approvedCount: 0,
        problem: {
          code: "noApprovedItems",
          message: "El dataset no tiene evidencias aprobadas para exportar.",
        },
        invalidItemCount: 0,
        invalidItems: [],
      }));
      await validate();

      const dialog = within(
        await screen.findByRole("dialog", { name: "Ítems que requieren revisión" }),
      );
      expect(
        dialog.getByText("El dataset no tiene evidencias aprobadas para exportar."),
      ).toBeInTheDocument();
    });

    it("reports a failed validation", async () => {
      serve(async () => {
        throw new Error("network");
      });
      await validate();

      expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos validar el dataset.");
    });

    it("takes the reviewer to an item already loaded in Evidencias", async () => {
      serve(async () => invalidValidation, {
        "": { items: [approvedItem, unlabeledItem], nextItemOffset: null },
      });
      const user = await validate();

      await user.click(await screen.findByRole("link", { name: "Revisar evidencia" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById("dataset-item-item-2")),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Evidencias" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        within(document.activeElement as HTMLElement).getByText("evidence-2"),
      ).toBeInTheDocument();
    });

    it("fetches an approved evidence item directly when it is not on the first page", async () => {
      const itemUrl = "/applications/app-1/datasets/dataset-1/evidence/item-2";
      serve(
        async () => invalidValidation,
        {
          "": { items: [approvedItem], nextItemOffset: null },
          approved: { items: [approvedItem], nextItemOffset: 1 },
          approved1: { items: [unlabeledItem], nextItemOffset: null },
        },
        { [itemUrl]: unlabeledItem },
      );
      const user = await validate();

      await user.click(await screen.findByRole("link", { name: "Revisar evidencia" }));

      await waitFor(() =>
        expect(document.activeElement).toBe(document.getElementById("dataset-item-item-2")),
      );
      expect(getMock).toHaveBeenCalledWith(
        itemUrl,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(getMock).not.toHaveBeenCalledWith(
        "/applications/app-1/datasets/dataset-1",
        expect.objectContaining({ params: { status: "approved", offset: 1 } }),
      );
      expect(
        within(screen.getByRole("form", { name: "Filtrar evidencias" })).getByLabelText("Estado"),
      ).toHaveValue("approved");

      await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));
      expect(screen.getAllByText("evidence-2")).toHaveLength(1);
    });
  });

  it("returns to the dataset list from the breadcrumb", async () => {
    const onBackToDatasets = vi.fn();
    renderDetail(onBackToDatasets);
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("link", { name: "Datasets" }));
    expect(onBackToDatasets).toHaveBeenCalledOnce();
  });
});
