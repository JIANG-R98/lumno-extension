// The contract between the automatic picture-in-picture content scripts (in
// the extension's isolated world) and the page bridge (in the page's own
// world, where the site's player objects live). The two worlds share only
// the DOM, so they talk through CustomEvents on window with plain data.

const PIP_PAGE_BRIDGE_REQUEST_EVENT = '__lumno_yt_force_exit_pip_req_2026__';
const PIP_PAGE_BRIDGE_RESPONSE_EVENT = '__lumno_yt_force_exit_pip_res_2026__';

// Asks the page bridge to leave picture-in-picture.
interface PipPageBridgeRequest {
  requestId: number;
}

// What the page bridge did, sent back with the request's id.
interface PipPageBridgeResponse {
  requestId: number;
  attempted: boolean;
  before: boolean;
  after: boolean;
  error: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readRequestId(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// Reads a request from an event's detail; a missing id reads as 0.
function readPipPageBridgeRequest(detail: unknown): PipPageBridgeRequest {
  return { requestId: isRecord(detail) ? readRequestId(detail.requestId) : 0 };
}

// Reads a response from an event's detail, or null when it is not one.
function readPipPageBridgeResponse(detail: unknown): PipPageBridgeResponse | null {
  if (!isRecord(detail)) {
    return null;
  }
  return {
    requestId: readRequestId(detail.requestId),
    attempted: Boolean(detail.attempted),
    before: Boolean(detail.before),
    after: Boolean(detail.after),
    error: typeof detail.error === 'string' ? detail.error : ''
  };
}

export {
  PIP_PAGE_BRIDGE_REQUEST_EVENT,
  PIP_PAGE_BRIDGE_RESPONSE_EVENT,
  readPipPageBridgeRequest,
  readPipPageBridgeResponse
};
export type { PipPageBridgeRequest, PipPageBridgeResponse };
