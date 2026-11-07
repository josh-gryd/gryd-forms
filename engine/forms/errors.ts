// The one error type the forms service throws on purpose: a status, a message
// and a body the router sends as is. Its own module so every forms module can
// throw it without importing the service.

export class ServiceError extends Error {
  constructor(public readonly status: number, message: string, public readonly body: Record<string, unknown> = {}) { super(message) }
}
