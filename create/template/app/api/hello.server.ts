import type { EndpointHandler } from '@threadlabs/markupkit';

export const GET = (() => Response.json({ message: 'Hello from app/api/hello.server.ts' })) satisfies EndpointHandler;
