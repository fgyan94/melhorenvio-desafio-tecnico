import { z } from 'zod';

export const LogEntrySchema = z.object({
  request: z
    .object({
      method: z.string().optional(),
      uri: z.string().optional(),
      url: z.string().optional(),
      size: z.number().optional(),
      querystring: z.unknown().optional(),
      headers: z.unknown().optional(),
    })
    .optional(),
  upstream_uri: z.string().optional(),
  response: z
    .object({
      status: z.number().optional(),
      size: z.number().optional(),
      headers: z.unknown().optional(),
    })
    .optional(),
  authenticated_entity: z
    .object({
      consumer_id: z
        .object({
          uuid: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  route: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
  service: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  latencies: z
    .object({
      proxy: z.number().optional(),
      gateway: z.number().optional(),
      request: z.number().optional(),
    })
    .optional(),
  client_ip: z.string().optional(),
  started_at: z.number().optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;
