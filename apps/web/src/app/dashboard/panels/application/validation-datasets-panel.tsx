"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpClient } from "@/lib/http-client";
import { uploadValidationDataset, type ValidationDatasetUploadResult } from "./validation-datasets";

type DatasetVersion = {
  id: string;
  datasetId: string;
  version: string;
  partition: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
};

type Dataset = {
  id: string;
  name: string;
  source: string;
  license: string;
  createdAt: string;
  versions: DatasetVersion[];
};

type ValidationDatasetsPanelProps = {
  applicationId: string;
  canManage: boolean;
  applicationStatus: "active" | "archived";
};

const MAX_ZIP_BYTES = 128 * 1024 * 1024;
const DUPLICATE_VERSION_MESSAGE = "Esa versión y partición ya están publicadas.";
const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function errorDetails(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) return {};
  const response = (error as { response?: { data?: { code?: string; message?: string } } })
    .response;
  return response?.data ?? {};
}

function formatSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} bytes`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}

export function ValidationDatasetsPanel({
  applicationId,
  canManage,
  applicationStatus,
}: ValidationDatasetsPanelProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [declaredRedistribution, setDeclaredRedistribution] = useState(false);
  const canEdit = canManage && applicationStatus === "active";

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const { data } = await httpClient.get<{ datasets: Dataset[] }>(
        `/applications/${applicationId}/validation-datasets`,
      );
      setDatasets(data.datasets);
    } catch {
      setListError("No se pudieron cargar los datasets de validación.");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  async function registerDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating) return;
    if (!name.trim() || !source.trim() || !license.trim() || !declaredRedistribution) {
      setCreateError(
        "Completa el nombre, la fuente, la licencia y la declaración de redistribución.",
      );
      return;
    }

    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      await httpClient.post(`/applications/${applicationId}/validation-datasets`, {
        name: name.trim(),
        source: source.trim(),
        license: license.trim(),
      });
      setName("");
      setSource("");
      setLicense("");
      setDeclaredRedistribution(false);
      setNotice("Dataset registrado.");
      await loadDatasets();
    } catch (error) {
      const details = errorDetails(error);
      setCreateError(
        details.code === "datasetExists"
          ? "Ya existe un dataset con ese nombre en esta aplicación."
          : (details.message ?? "No se pudo registrar el dataset."),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="validation-datasets-heading">
      <header className="space-y-2">
        <h2 id="validation-datasets-heading" className="font-semibold text-xl">
          Datasets de validación
        </h2>
        <p className="text-muted-foreground text-sm">
          Administra paquetes ZIP privados que los dispositivos descargarán antes de ejecutar sus
          pruebas.
        </p>
      </header>

      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}

      {canEdit && (
        <form className="space-y-4 rounded-lg border p-4" onSubmit={registerDataset} noValidate>
          <h3 className="font-semibold">Registrar dataset</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <label htmlFor="validation-dataset-name" className="space-y-2 font-medium text-sm">
              <span>Nombre del dataset</span>
              <Input
                id="validation-dataset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={creating}
              />
            </label>
            <label htmlFor="validation-dataset-source" className="space-y-2 font-medium text-sm">
              <span>Fuente</span>
              <Input
                id="validation-dataset-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                disabled={creating}
              />
            </label>
            <label htmlFor="validation-dataset-license" className="space-y-2 font-medium text-sm">
              <span>Licencia</span>
              <Input
                id="validation-dataset-license"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                disabled={creating}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={declaredRedistribution}
              disabled={creating}
              aria-label="Declaro que puedo redistribuir este dataset"
              onChange={(event) => setDeclaredRedistribution(event.target.checked)}
            />
            <span>Declaro que puedo redistribuir este dataset para la validación.</span>
          </label>
          <p className="text-muted-foreground text-sm">
            Quien opera declara que puede redistribuir el dataset; el sistema no certifica
            cumplimiento legal.
          </p>
          {createError && (
            <p role="alert" className="text-destructive text-sm">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={creating}>
            {creating ? "Registrando…" : "Registrar dataset"}
          </Button>
        </form>
      )}

      {loading && <p role="status">Cargando datasets…</p>}
      {listError && (
        <div className="space-y-2" role="alert">
          <p>{listError}</p>
          <Button type="button" variant="outline" onClick={() => void loadDatasets()}>
            Reintentar
          </Button>
        </div>
      )}
      {!loading && !listError && datasets.length === 0 && (
        <p className="rounded-lg border p-4 text-muted-foreground text-sm">
          Todavía no hay datasets registrados.
        </p>
      )}

      <div className="space-y-4">
        {datasets.map((dataset) => (
          <article key={dataset.id} className="space-y-4 rounded-lg border p-4">
            <header className="space-y-1">
              <h3 className="font-semibold">{dataset.name}</h3>
              <p className="text-sm">
                <span className="font-medium">Fuente:</span> {dataset.source}
              </p>
              <p className="text-sm">
                <span className="font-medium">Licencia declarada:</span> {dataset.license}
              </p>
            </header>

            {dataset.versions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin versiones publicadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2">Versión y partición</th>
                      <th className="p-2">Tamaño</th>
                      <th className="p-2">SHA-256</th>
                      <th className="p-2">Subida</th>
                      <th className="p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.versions.map((datasetVersion) => (
                      <tr key={datasetVersion.id} className="border-b last:border-0">
                        <td className="p-2">
                          {datasetVersion.version} · {datasetVersion.partition}
                        </td>
                        <td className="p-2">{formatSize(datasetVersion.sizeBytes)}</td>
                        <td className="max-w-56 break-all p-2 font-mono text-xs">
                          {datasetVersion.sha256}
                        </td>
                        <td className="p-2">{formatDate(datasetVersion.createdAt)}</td>
                        <td className="p-2">Disponible</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && (
              <ValidationDatasetVersionUpload
                applicationId={applicationId}
                datasetId={dataset.id}
                onUploaded={async () => {
                  setNotice(
                    "ZIP verificado y publicado. Los dispositivos comprobarán el manifiesto y las imágenes antes de ejecutar.",
                  );
                  await loadDatasets();
                }}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ValidationDatasetVersionUpload({
  applicationId,
  datasetId,
  onUploaded,
}: {
  applicationId: string;
  datasetId: string;
  onUploaded: () => Promise<void>;
}) {
  const [version, setVersion] = useState("");
  const [partition, setPartition] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"starting" | "uploading" | "verifying">(
    "starting",
  );
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function submitUpload() {
    if (uploading) return;
    if (!STRICT_SEMVER.test(version.trim())) {
      setUploadError("Ingresa una versión SemVer válida, por ejemplo 1.0.0.");
      return;
    }
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(partition)) {
      setUploadError("Ingresa una partición válida de hasta 64 caracteres.");
      return;
    }
    if (!file?.name.toLowerCase().endsWith(".zip") || file.size === 0) {
      setUploadError("Selecciona un archivo ZIP válido.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setUploadError("El ZIP supera el tamaño máximo permitido de 128 MiB.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setUploadPhase("starting");
    setProgress(0);
    setUploadError("");

    let result: ValidationDatasetUploadResult;
    try {
      result = await uploadValidationDataset({
        applicationId,
        datasetId,
        version: version.trim(),
        partition,
        file,
        signal: controller.signal,
        onProgress: setProgress,
        onPhase: setUploadPhase,
      });
    } finally {
      abortRef.current = null;
      setUploading(false);
    }

    if (!result.ok) {
      if (result.code !== "canceled") {
        setUploadError(
          result.code === "datasetVersionExists"
            ? DUPLICATE_VERSION_MESSAGE
            : result.message || "No se pudo guardar el dataset.",
        );
      }
      return;
    }

    setVersion("");
    setPartition("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await onUploaded();
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="font-medium text-sm">Subir una versión ZIP</h4>
      <div className="grid gap-3 md:grid-cols-3">
        <label
          htmlFor={`validation-dataset-version-${datasetId}`}
          className="space-y-2 font-medium text-sm"
        >
          <span>Versión</span>
          <Input
            id={`validation-dataset-version-${datasetId}`}
            value={version}
            placeholder="1.0.0"
            disabled={uploading}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
        <label
          htmlFor={`validation-dataset-partition-${datasetId}`}
          className="space-y-2 font-medium text-sm"
        >
          <span>Partición</span>
          <Input
            id={`validation-dataset-partition-${datasetId}`}
            value={partition}
            placeholder="test"
            disabled={uploading}
            onChange={(event) => setPartition(event.target.value)}
          />
        </label>
        <label
          htmlFor={`validation-dataset-zip-${datasetId}`}
          className="space-y-2 font-medium text-sm"
        >
          <span>Archivo ZIP</span>
          <Input
            id={`validation-dataset-zip-${datasetId}`}
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            disabled={uploading}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {uploading && (
        <div className="space-y-1">
          {uploadPhase === "verifying" ? (
            <p role="status" className="text-muted-foreground text-sm">
              Verificando ZIP y calculando SHA-256…
            </p>
          ) : uploadPhase === "uploading" ? (
            <>
              <div
                role="progressbar"
                aria-label="Subiendo ZIP del dataset"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-muted-foreground text-sm">Subiendo ZIP… {progress}%</p>
            </>
          ) : null}
        </div>
      )}

      {uploadError && (
        <p role="alert" className="text-destructive text-sm">
          {uploadError}
        </p>
      )}
      {uploading ? (
        uploadPhase !== "verifying" && (
          <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
            Cancelar subida
          </Button>
        )
      ) : (
        <Button type="button" onClick={() => void submitUpload()}>
          Subir versión
        </Button>
      )}
    </div>
  );
}
