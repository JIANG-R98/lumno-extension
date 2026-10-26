// What the functions run in a page's main world report back.

interface PipEnterResult {
  ok: boolean;
  before: boolean;
  after: boolean;
  attempted: boolean;
  used: string;
  error: string;
}

interface PipAutoSetupResult {
  ok: boolean;
  bound: boolean;
  preparedVideos: number;
  error: string;
}

interface PipExitResult {
  ok: boolean;
  before: boolean;
  after: boolean;
  attemptedExit: boolean;
  error: string;
}

interface YoutubePipExitResult extends PipExitResult {
  unminimized: boolean;
}

// A player method to try, with its arguments.
interface PlayerMethodCandidate {
  name: string;
  args: unknown[];
}

export type { PipAutoSetupResult, PipEnterResult, PipExitResult, PlayerMethodCandidate, YoutubePipExitResult };
