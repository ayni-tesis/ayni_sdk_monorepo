ALTER TABLE "sdk_trace" ADD COLUMN "model_references" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "sdk_trace" AS stored_trace
SET "model_references" = COALESCE(
  (
    SELECT jsonb_agg(
      DISTINCT jsonb_build_object(
        'modelId', model_version.model_id,
        'modelVersionId', trace_model.value ->> 'modelVersionId',
        'version', trace_model.value ->> 'version'
      )
    )
    FROM jsonb_array_elements(COALESCE(stored_trace.trace -> 'models', '[]'::jsonb)) AS trace_model(value)
    INNER JOIN "model_version" AS model_version
      ON model_version.id = trace_model.value ->> 'modelVersionId'
    INNER JOIN "model" AS model
      ON model.id = model_version.model_id
      AND model.application_id = stored_trace.application_id
  ),
  '[]'::jsonb
);--> statement-breakpoint
CREATE INDEX "sdk_trace_model_references_gin_idx" ON "sdk_trace" USING gin ("model_references");
