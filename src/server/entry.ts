import { handleGameRequest } from './gameServer';

// Точка входа Edge Function. Секретный ключ Supabase подставляет сам, в проекте его нет.

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const named = keys ? (JSON.parse(keys) as Record<string, string>).default : undefined;
  return named ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

Deno.serve((request) =>
  handleGameRequest(request, {
    url: Deno.env.get('SUPABASE_URL') ?? '',
    key: secretKey(),
  }),
);
