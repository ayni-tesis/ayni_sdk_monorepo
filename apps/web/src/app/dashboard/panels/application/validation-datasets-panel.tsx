"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpClient } from "@/lib/http-client";
import {
  type ValidationDatasetUploadResult,
  uploadValidationDataset,
} from "./validation-datasets";

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
  const response = (error as { response?: { data?: { code?: string; message?: string } } }).response;
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
  const [version, setVersion] = useState("");
  const [partition, setPartition] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadingDatasetId, setUploadingDatasetId] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"starting" | "uploading" | "verifying">("starting");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    return () => abortRef.current?.abort();
  }, [loadDatasets]);

  async function registerDataset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating) return;
    if (!name.trim() || !source.trim() || !license.trim() || !declaredRedistribution) {
      setCreateError("Completa el nombre, la fuente, la licencia y la declaración de redistribución.");
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
          : details.message ?? "No se pudo registrar el dataset.",
      );
    } finally {
      setCreating(false);
    }
  }

  function resetUpload() {
    setUploadingDatasetId(null);
    setUploadPhase("starting");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFile(null);
    setUploadError("");
  }

  async function submitUpload(datasetId: string) {
    if (!canEdit || uploadingDatasetId) return;
    if (!STRICT_SEMVER.test(version.trim())) {
      setUploadError("Ingresa una versión SemVer válida, por ejemplo 1.0.0.");
      return;
    }
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(partition)) {
      setUploadError("Ingresa una partición válida de hasta 64 caracteres.");
      return;
    }
    if (!file || !file.name.toLowerCase().endsWith(".zip") || file.size === 0) {
      setUploadError("Selecciona un archivo ZIP válido.");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setUploadError("El ZIP supera el tamaño máximo permitido de 128 MiB.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploadingDatasetId(datasetId);
    setUploadPhase("starting");
    setProgress(0);
    setUploadError("");
    setNotice("");

    const result: ValidationDatasetUploadResult = await uploadValidationDataset({
      applicationId,
      datasetId,
      version: version.trim(),
      partition,
      file,
      signal: controller.signal,
      onProgress: setProgress,
      onPhase: setUploadPhase,
    });
    abortRef.current = null;

    if (!result.ok) {
      resetUpload();
      if (result.code !== "canceled") {
        setUploadError(
          result.code === "datasetVersionExists"
            ? DUPLICATE_VERSION_MESSAGE
            : result.message || "No se pudo guardar el dataset.",
        );
      }
      return;
    }

    resetUpload();
    setVersion("");
    setPartition("");
    setNotice(
      "ZIP verificado y publicado. Los dispositivos comprobarán el manifiesto y las imágenes antes de ejecutar.",
    );
    await loadDatasets();
  }

  return (
    <section className="space-y-6" aria-labelledby="validation-datasets-heading">
      <header className="space-y-2">
        <h2 id="validation-datasets-heading" className="font-semibold text-xl">
          Datasets de validación
        </h2>
        <p className="text-muted-foreground text-sm">
          Administra paquetes ZIP privados que los dispositivos descargarán antes de ejecutar sus pruebas.
        </p>
      </header>

      {notice && <p role="status" className="text-sm">{notice}</p>}

      {canEdit && (
        <form className="space-y-4 rounded-lg border p-4" onSubmit={registerDataset} noValidate>
          <h3 className="font-semibold">Registrar dataset</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">
              <span>Nombre del dataset</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={creating} />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Fuente</span>
              <Input value={source} onChange={(event) => setSource(event.target.value)} disabled={creating} />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Licencia</span>
              <Input
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
            <span>
              Declaro que puedo redistribuir este dataset para la validación.
            </span>
          </label>
          <p className="text-muted-foreground text-sm">
            Quien opera declara que puede redistribuir el dataset; el sistema no certifica cumplimiento legal.
          </p>
          {createError && <p role="alert" className="text-destructive text-sm">{createError}</p>}
          <Button type="submit" disabled={creating}>{creating ? "Registrando…" : "Registrar dataset"}</Button>
        </form>
      )}

      {loading && <p role="status">Cargando datasets…</p>}
      {listError && (
        <div className="space-y-2" role="alert">
          <p>{listError}</p>
          <Button type="button" variant="outline" onClick={() => void loadDatasets()}>Reintentar</Button>
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
              <p className="text-sm"><span className="font-medium">Fuente:</span> {dataset.source}</p>
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
                        <td className="p-2">{datasetVersion.version} · {datasetVersion.partition}</td>
                        <td className="p-2">{formatSize(datasetVersion.sizeBytes)}</td>
                        <td className="max-w-56 break-all p-2 font-mono text-xs">{datasetVersion.sha256}</td>
                        <td className="p-2">{formatDate(datasetVersion.createdAt)}</td>
                        <td className="p-2">Disponible</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-medium text-sm">Subir una versión ZIP</h4>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium">
                    <span>Versión</span>
                    <Input
                      value={version}
                      placeholder="1.0.0"
                      disabled={uploadingDatasetId !== null}
                      onChange={(event) => setVersion(event.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>Partición</span>
                    <Input
                      value={partition}
                      placeholder="test"
                      disabled={uploadingDatasetId !== null}
                      onChange={(event) => setPartition(event.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium">
                    <span>Archivo ZIP</span>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,application/zip"
                      disabled={uploadingDatasetId !== null}
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>

                {uploadingDatasetId === dataset.id && (
                  <div className="space-y-1">
                    {uploadPhase === "verifying" ? (
                      <p role="status" className="text-muted-foreground text-sm">
                        Verificando ZIP y calculando SHA-256…
                      </p>
                    ) : (
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
                    )}
                  </div>
                )}

                {uploadError && <p role="alert" className="text-destructive text-sm">{uploadError}</p>}
                {uploadingDatasetId === dataset.id ? (
                  uploadPhase !== "verifying" && (
                    <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
                      Cancelar subida
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    disabled={uploadingDatasetId !== null}
                    onClick={() => void submitUpload(dataset.id)}
                  >
                    Subir versión
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
