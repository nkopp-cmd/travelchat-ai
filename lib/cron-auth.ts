type RequestWithHeaders = Pick<Request, "headers">;

export function isCronRequestAuthorized(request: RequestWithHeaders): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
