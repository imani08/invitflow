import { randomUUID } from 'node:crypto';

export type RequestContext = {
  requestId: string;
  correlationId: string;
};

const SAFE_ID = /^[a-zA-Z0-9-]{1,100}$/;

export function createRequestContext(
  incomingRequestId: unknown,
  incomingCorrelationId: unknown,
  createId: () => string = randomUUID,
): RequestContext {
  const requestId =
    typeof incomingRequestId === 'string' && SAFE_ID.test(incomingRequestId)
      ? incomingRequestId
      : createId();
  const correlationId =
    typeof incomingCorrelationId === 'string' && SAFE_ID.test(incomingCorrelationId)
      ? incomingCorrelationId
      : requestId;

  return { requestId, correlationId };
}

export function withRequestContextHeaders(
  input: HeadersInit | undefined,
  context: RequestContext,
): Headers {
  const headers = new Headers(input);
  headers.set('x-request-id', context.requestId);
  headers.set('x-correlation-id', context.correlationId);
  return headers;
}
