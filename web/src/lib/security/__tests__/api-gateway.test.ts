import { guardApiRequest } from "@/lib/security/api-gateway";

function req(pathname: string, method = "GET", headers: Record<string, string> = {}) {
  return {
    method,
    nextUrl: new URL(`https://work-hat.com${pathname}`),
    headers: new Headers(headers),
  } as never;
}

describe("api gateway Redis degradation", () => {
  const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalFailOpen = process.env.SECURITY_RATE_LIMIT_FAIL_OPEN;

  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.SECURITY_RATE_LIMIT_FAIL_OPEN;
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
    if (originalRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
    if (originalFailOpen === undefined) delete process.env.SECURITY_RATE_LIMIT_FAIL_OPEN;
    else process.env.SECURITY_RATE_LIMIT_FAIL_OPEN = originalFailOpen;
  });

  it("fails open for authenticated setup APIs when Redis is missing", async () => {
    const response = await guardApiRequest(req("/api/email/setup/readiness"), {
      phase: "post-auth",
      userId: "user-1",
    });

    expect(response).toBeNull();
  });

});
