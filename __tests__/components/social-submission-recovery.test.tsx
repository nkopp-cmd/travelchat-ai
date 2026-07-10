import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialSubmissionRecovery } from "@/components/admin/social-submission-recovery";

const submissionId = "11111111-1111-4111-8111-111111111111";

function reviewResponse() {
  return new Response(JSON.stringify({
    dryRun: true,
    eligible: [{
      id: submissionId,
      platform: "tiktok",
      status: "spot_created",
      name: "Legacy Seoul Spot",
      hasSpot: true,
      createdAt: "2026-07-05T00:00:00.000Z",
    }],
    planToken: "review-plan-token-with-a-valid-length-1234567890",
    cutoff: "2026-07-10T09:00:00.000Z",
    expiresAt: "2099-07-10T09:10:00.000Z",
    provider: { instagramConfigured: false },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function executionResponse() {
  return new Response(JSON.stringify({
    dryRun: false,
    requestKey: "request-key",
    claimed: [submissionId],
    skipped: [],
    worker: {
      started: true,
      status: 200,
      summary: {
        success: true,
        inspected: 1,
        claimed: 1,
        succeeded: 1,
        retried: 0,
        finalized: 1,
        deadLettered: 0,
      },
    },
  }), { status: 202, headers: { "content-type": "application/json" } });
}

describe("SocialSubmissionRecovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with a safe bounded scope and disables unavailable Instagram recovery", () => {
    render(<SocialSubmissionRecovery instagramConfigured={false} />);

    expect((screen.getByRole("combobox", { name: "Posts per run" }) as HTMLSelectElement).value).toBe("3");
    expect((screen.getByRole("switch", { name: "Include Instagram posts" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("switch", { name: "Include submissions with existing spots" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("button", { name: /Queue and run/i })).toBeNull();
  });

  it("reviews exact rows before exposing the recovery command", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(reviewResponse());
    render(<SocialSubmissionRecovery instagramConfigured={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Review eligible posts" }));

    const list = await screen.findByRole("list", { name: "Eligible legacy posts" });
    expect(within(list).getByText("Legacy Seoul Spot")).toBeTruthy();
    expect(within(list).getByText("Existing spot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Queue and run 1 post" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/spots/social-submissions/backfill",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          dryRun: true,
          limit: 3,
          includeInstagram: false,
          includeResolved: false,
        }),
      }),
    );
  });

  it("invalidates a signed review when its scope changes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(reviewResponse());
    render(<SocialSubmissionRecovery instagramConfigured={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Review eligible posts" }));
    await screen.findByRole("button", { name: "Queue and run 1 post" });
    fireEvent.click(screen.getByRole("switch", { name: "Include submissions with existing spots" }));

    expect(screen.queryByRole("button", { name: "Queue and run 1 post" })).toBeNull();
    expect(screen.getByText("No active review plan")).toBeTruthy();
  });

  it("requires confirmation, sends an idempotency key, and announces worker completion", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(reviewResponse())
      .mockResolvedValueOnce(executionResponse());
    render(<SocialSubmissionRecovery instagramConfigured={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Review eligible posts" }));
    fireEvent.click(await screen.findByRole("button", { name: "Queue and run 1 post" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Start 1 reviewed post?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start recovery" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const executeOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(executeOptions.body).toBe(JSON.stringify({
      dryRun: false,
      planToken: "review-plan-token-with-a-valid-length-1234567890",
    }));
    expect((executeOptions.headers as Record<string, string>)["idempotency-key"]).toMatch(/^legacy-ui-/);
    expect((await screen.findByRole("status")).textContent).toContain("1 post admitted");
    expect(screen.getByText(/Worker completed the current batch with 2 state updates/i)).toBeTruthy();
  });

  it("announces API failures without exposing an execution control", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: "provider_not_configured", message: "Provider unavailable." },
    }), { status: 409, headers: { "content-type": "application/json" } }));
    render(<SocialSubmissionRecovery instagramConfigured={true} />);

    fireEvent.click(screen.getByRole("switch", { name: "Include Instagram posts" }));
    fireEvent.click(screen.getByRole("button", { name: "Review eligible posts" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Provider unavailable.");
    expect(screen.queryByRole("button", { name: /Queue and run/i })).toBeNull();
  });
});
