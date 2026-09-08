# Story Image Recovery

Use an authorized operator SQL connection. These functions are not available to browser roles.
Never paste owner tokens, API credentials, or private customer records into logs or chat.

## Inspect

Check counts before taking action:

```sql
SELECT state, count(*) AS jobs,
       count(*) FILTER (WHERE deadline <= now()) AS past_deadline
FROM public.story_image_jobs
GROUP BY state;
```

`reserved` means the provider submission has not been authorized yet.
`submitted` means a provider request might have started. It does not prove delivery or provider billing.
`succeeded` contains a controlled output URL. `failed` is terminal for its request key.

## Expired Reservations

Recover only a bounded group that never reached submission:

```sql
SELECT public.reconcile_story_image_job(clerk_user_id, idempotency_key)->>'state' AS result
FROM (
  SELECT clerk_user_id, idempotency_key
  FROM public.story_image_jobs
  WHERE state = 'reserved' AND deadline <= now()
  ORDER BY deadline
  LIMIT 25
) AS expired;
```

The function rechecks the state under its lock. Concurrent submission or recovery cannot refund the same job twice.
The refund uses the original recorded month.
Repeat the count query afterward. Stop if the function reports an inconsistent counter.

## Submitted Jobs

Do not automatically replay or refund these jobs based only on age.
Review provider evidence, request timing, and the exact controlled storage prefix first.
Inspect PNG/JPEG bytes and decode the stored image before declaring it delivered.
Do not accept an arbitrary URL supplied by a customer.

For a verified stored result, call `settle_story_image_job` with the recorded owner token and exact allowed output URL.
For confirmed failed delivery, call it with the recorded owner token and a null output URL.
Use parameterized operator tooling. Do not put tokens into shell arguments or commit them.
Settlement is fenced and idempotent; a conflicting terminal result is rejected.

If the outcome remains unknown, leave the reservation pending and investigate.
Current synchronous adapters do not persist every provider request ID, so some cases require dashboard or log review.
A credit refund does not imply that the provider refunds its charge.
Never reset usage counters or delete ledger rows to make a stuck request disappear.

## Operational Limits

No automatic submitted-job reconciliation or operator dashboard is deployed.
Observe pending counts after release and handle support cases through this procedure.
New GPT Image 2 generation stays disabled until its separate monetary and live-quality gates pass.
Video accounting and processing have separate deployment requirements.
