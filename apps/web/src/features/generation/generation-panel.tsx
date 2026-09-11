'use client';

import type { Asset, AssetSelectionContext, Entity } from '@level-zero/domain';
import {
  Button,
  Field,
  SectionPanel,
  SparklesIcon,
  StatusBadge,
  Tabs,
  Tag,
  Textarea,
} from '@level-zero/ui';
import { useEffect, useState } from 'react';

import { apiErrorMessage } from '@/lib/api';

import {
  canStart,
  failureText,
  generationProgress,
  generationTone,
  isGenerationRunning,
  modeNeedsSource,
  progressLabel,
  GENERATION_MODES,
  MODE_LABEL,
  MODE_PROMPT_LABEL,
  type GenerationMode,
} from './generation';
import { GenerationResults } from './generation-results';
import {
  useCancelGeneration,
  useGeneration,
  useGenerationJob,
  useJobStream,
  useRunningImageGenerations,
  useStartGeneration,
} from './use-generation';

/** A named action a workspace offers, in the words that workspace uses. */
export interface GenerationPreset {
  label: string;
  mode: GenerationMode;
  /** Prefills the prompt; the user is free to rewrite it before generating. */
  prompt: string;
}

export interface GenerationPanelProps {
  projectId: string;
  /**
   * Entities the request should carry as context — the character being drawn,
   * the location being illustrated. The API walks outwards from these.
   */
  contextEntities?: readonly Entity[];
  /** Images offered as references, and as the source of an edit or a variation. */
  referenceAssets?: readonly Asset[];
  presets?: readonly GenerationPreset[];
  /** What this workspace does with a result the user keeps. */
  onUseResult?: (asset: Asset) => void;
  useResultLabel?: string;
  /**
   * What a result would be chosen *for*, when the surface has an answer —
   * a character and `portrait`, a board and its direction. Given one, every
   * result carries the triage actions; left out, the grid is read-only about
   * selection, because "approved" with nothing to be approved for is not a
   * thing this model records.
   */
  selectionContext?: AssetSelectionContext;
  /** Passed through to the result grid: does this purpose hold one visual? */
  replaceCurrentSelection?: boolean;
}

/**
 * The one visual generation surface, embedded wherever images are made.
 *
 * Character Studio, Moodboards and any other visual workspace pass what they
 * have — the entities in play, the images already in the project, the actions
 * they call things — and get the whole flow: prompt, context chips, reference
 * images, progress, results, variations and provenance. A workspace that wants
 * a generator does not build one.
 *
 * Nothing about a run is held here that a reload would lose. The generation and
 * its job are the state, so a surface that mounts mid-run asks what is still
 * running and picks that up, then follows the job stream for the rest.
 */
export function GenerationPanel({
  projectId,
  contextEntities = [],
  referenceAssets = [],
  presets = [],
  onUseResult,
  useResultLabel,
  selectionContext,
  replaceCurrentSelection,
}: GenerationPanelProps) {
  const [mode, setMode] = useState<GenerationMode>('generate');
  const [prompt, setPrompt] = useState('');
  const [sourceAssetIds, setSourceAssetIds] = useState<readonly string[]>([]);
  const [droppedEntityIds, setDroppedEntityIds] = useState<readonly string[]>([]);
  const [watchedId, setWatchedId] = useState<string | null>(null);

  useJobStream(projectId);
  const running = useRunningImageGenerations(projectId);
  const start = useStartGeneration(projectId);
  const cancel = useCancelGeneration(projectId);

  // Reconnect: whatever this project already has in flight becomes what the
  // surface is watching, unless the user has since started something newer.
  const inFlightId = running.data?.[0]?.id ?? null;
  useEffect(() => {
    if (inFlightId) setWatchedId((current) => current ?? inFlightId);
  }, [inFlightId]);

  const generation = useGeneration(projectId, watchedId);
  const job = useGenerationJob(projectId, watchedId);

  const record = generation.data ?? null;
  const active = record !== null && isGenerationRunning(record);
  const contextIds = contextEntities
    .map((entity) => entity.id)
    .filter((id) => !droppedEntityIds.includes(id));

  function submit(): void {
    start.mutate(
      { mode, prompt, contextEntityIds: contextIds, sourceAssetIds },
      { onSuccess: (queued) => setWatchedId(queued.id) },
    );
  }

  /** Re-rolls one result: a fresh generation, with the result as its source. */
  function exploreVariations(asset: Asset): void {
    setMode('variation');
    setSourceAssetIds([asset.id]);
    start.mutate(
      {
        mode: 'variation',
        prompt: prompt.trim() || `another direction for ${asset.filename}`,
        contextEntityIds: contextIds,
        sourceAssetIds: [asset.id],
        ...(record ? { parentGenerationId: record.id } : {}),
      },
      { onSuccess: (queued) => setWatchedId(queued.id) },
    );
  }

  return (
    <SectionPanel
      title="Generate"
      description="Results are ordinary project assets. Keeping one links it; nothing is overwritten."
      actions={
        record && (
          <StatusBadge tone={generationTone(record)}>
            {record.status === 'complete' ? 'Ready' : record.status}
          </StatusBadge>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          items={GENERATION_MODES.map((value) => ({ value, label: MODE_LABEL[value] }))}
          value={mode}
          onChange={(value) => setMode(value as GenerationMode)}
        />

        {presets.length > 0 && (
          <Field label="Start from" hint="Fills the prompt; edit it before generating.">
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="ai"
                  size="sm"
                  onClick={() => {
                    setMode(preset.mode);
                    setPrompt(preset.prompt);
                  }}
                >
                  <SparklesIcon className="size-4" />
                  {preset.label}
                </Button>
              ))}
            </div>
          </Field>
        )}

        <Field label={MODE_PROMPT_LABEL[mode]} htmlFor="generation-prompt">
          <Textarea
            id="generation-prompt"
            value={prompt}
            placeholder="Describe what you'd like to explore…"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>

        {contextEntities.length > 0 && (
          <Field
            label="Project context"
            hint="What the model reads alongside the prompt. The project walks outwards from these."
          >
            <div className="flex flex-wrap gap-1.5">
              {contextEntities
                .filter((entity) => !droppedEntityIds.includes(entity.id))
                .map((entity) => (
                  <Tag
                    key={entity.id}
                    onRemove={() => setDroppedEntityIds((current) => [...current, entity.id])}
                  >
                    {entity.name}
                  </Tag>
                ))}
            </div>
          </Field>
        )}

        <ReferencePicker
          assets={referenceAssets}
          selected={sourceAssetIds}
          required={modeNeedsSource(mode)}
          onToggle={(assetId) =>
            setSourceAssetIds((current) =>
              current.includes(assetId)
                ? current.filter((id) => id !== assetId)
                : [...current, assetId],
            )
          }
        />

        {start.isError && (
          <p className="text-xs text-error">
            {apiErrorMessage(start.error, 'Could not start that generation.')}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ai"
            disabled={!canStart(mode, prompt, sourceAssetIds) || active || start.isPending}
            onClick={submit}
          >
            <SparklesIcon className="size-4" />
            {active ? 'Generating…' : MODE_LABEL[mode]}
          </Button>

          {active && watchedId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(watchedId)}
            >
              Cancel
            </Button>
          )}
        </div>

        {active && (
          <p className="text-xs text-ai-foreground">
            {progressLabel(generationProgress(job.data ?? null))}
          </p>
        )}

        {record?.status === 'failed' && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-error">{failureText(record)}</p>
            <p className="text-xs text-faint-foreground">
              Nothing was stored. The prompt above is still what was asked for.
            </p>
          </div>
        )}

        {record?.status === 'complete' && (
          <GenerationResults
            projectId={projectId}
            generation={record}
            onExploreVariations={exploreVariations}
            {...(onUseResult ? { onUseResult } : {})}
            {...(useResultLabel ? { useResultLabel } : {})}
            {...(selectionContext ? { selectionContext } : {})}
            {...(replaceCurrentSelection ? { replaceCurrentSelection } : {})}
          />
        )}
      </div>
    </SectionPanel>
  );
}

/**
 * The images a request works from.
 *
 * Checkboxes rather than a select, because a variation from several plates at
 * once is a real ask — and because an edit reads the first one, which a list
 * makes visible.
 */
function ReferencePicker({
  assets,
  selected,
  required,
  onToggle,
}: {
  assets: readonly Asset[];
  selected: readonly string[];
  required: boolean;
  onToggle: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return required ? (
      <p className="text-xs text-faint-foreground">
        This project has no images yet. Generate one first, then edit or vary it.
      </p>
    ) : null;
  }

  return (
    <Field
      label="Reference images"
      hint={
        required
          ? 'Required: an edit or a variation works from an existing image.'
          : 'Optional: plates the result should take after.'
      }
    >
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {assets.map((asset) => (
          <li key={asset.id}>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input
                type="checkbox"
                checked={selected.includes(asset.id)}
                onChange={() => onToggle(asset.id)}
              />
              <span className="truncate">{asset.filename}</span>
            </label>
          </li>
        ))}
      </ul>
    </Field>
  );
}
