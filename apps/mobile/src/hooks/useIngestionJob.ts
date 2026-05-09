import { useEffect, useState } from "react";

import { humanizeIngestError } from "../lib/ingestErrors";
import { subscribeToJob, type JobUpdate } from "../lib/jobSubscription";
import type { JobResponse, WorkoutRow } from "../types";

interface UseIngestionJobReturn {
  job: JobResponse | null;
  workout: WorkoutRow | null;
  error: string | null;
}

const EMPTY_STATE: JobUpdate = { job: null, workout: null, error: null };

/**
 * Subscribe to ingestion-job status updates.
 *
 * The actual polling lives in `lib/jobSubscription` so multiple consumers
 * for the same job share one loop, the cadence ramps down as the job ages,
 * and the AppState foreground refresh is debounced. This hook is a thin
 * React surface over that singleton — when SSE lands, only the singleton
 * needs to change.
 */
export function useIngestionJob(
  jobId: string | null,
  accessToken: string | null,
): UseIngestionJobReturn {
  const [state, setState] = useState<JobUpdate>(EMPTY_STATE);

  useEffect(() => {
    if (!jobId || !accessToken) {
      setState(EMPTY_STATE);
      return;
    }
    return subscribeToJob(jobId, accessToken, setState);
  }, [jobId, accessToken]);

  // Preserve the original semantics: humanize the parser/pipeline error only
  // when the job is in a terminal `failed` state. Network/transport errors
  // from the polling loop are surfaced verbatim from the singleton.
  const error =
    state.error ??
    (state.job?.status === "failed"
      ? humanizeIngestError(state.job.error)
      : null);

  return { job: state.job, workout: state.workout, error };
}
