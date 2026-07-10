import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SubmissionMediaProgress,
  SubmissionMediaProgressProvider,
  type SubmissionMediaProgressItem,
} from "@/components/spots/submission-media-progress";

const items: SubmissionMediaProgressItem[] = [
  {
    id: "image-1",
    kind: "image",
    ordinal: 1,
    state: "queued",
    attempts: 0,
    maxAttempts: 3,
  },
  {
    id: "video-2",
    kind: "video",
    ordinal: 2,
    state: "processing",
    attempts: 1,
    maxAttempts: 3,
  },
  {
    id: "image-3",
    kind: "image",
    ordinal: 3,
    state: "retry_wait",
    attempts: 2,
    maxAttempts: 3,
  },
  {
    id: "image-4",
    kind: "image",
    ordinal: 4,
    state: "succeeded",
    attempts: 1,
    maxAttempts: 3,
  },
  {
    id: "video-5",
    kind: "video",
    ordinal: 5,
    state: "dead_letter",
    attempts: 3,
    maxAttempts: 3,
    publicErrorCode: "MEDIA_DOWNLOAD_FAILED",
  },
];

describe("SubmissionMediaProgress", () => {
  it("renders clear copy for every media state and attempt count", () => {
    render(<SubmissionMediaProgress items={items} />);

    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.getByText("Waiting to retry")).toBeTruthy();
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("Couldn't process")).toBeTruthy();
    expect(screen.getByText("Attempts 0 of 3")).toBeTruthy();
    expect(screen.getByText("Attempts 2 of 3")).toBeTruthy();
  });

  it("announces status politely and exposes truthful determinate progress", () => {
    render(<SubmissionMediaProgress items={items} />);

    const status = screen.getByRole("status");
    const progress = screen.getByRole("progressbar", {
      name: "Media processing progress",
    });

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("40");
    expect(progress.getAttribute("aria-valuetext")).toBe(
      "2 of 5 media items finished; 1 succeeded; 1 failed; 3 remaining",
    );
    expect(screen.getByText("2 of 5 finished")).toBeTruthy();
    expect(
      screen.getByText(
        "1 succeeded · 1 failed · 1 processing · 1 waiting to retry · 1 queued",
      ),
    ).toBeTruthy();
  });

  it("keeps summary state counts grammatical when a state has multiple items", () => {
    render(<SubmissionMediaProgress items={[items[0], { ...items[0], id: "image-6", ordinal: 6 }]} />);

    expect(screen.getByText("2 queued")).toBeTruthy();
  });

  it("shows a public failure code without exposing a retry control by default", () => {
    render(<SubmissionMediaProgress items={items} />);

    expect(screen.getByText("MEDIA_DOWNLOAD_FAILED")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry video 5" })).toBeNull();
  });

  it("keeps the first four rows compact and discloses additional media accessibly", () => {
    render(<SubmissionMediaProgress items={items} />);

    const primaryList = screen.getByRole("list", { name: "Media items" });
    const details = screen.getByText("Show 1 more media item").closest("details");

    expect(within(primaryList).getAllByRole("listitem")).toHaveLength(4);
    expect(details).toBeTruthy();
    expect(
      within(details as HTMLElement).getByRole("list", {
        name: "Additional media items",
      }),
    ).toBeTruthy();
    expect(within(details as HTMLElement).getByText("Video 5")).toBeTruthy();
  });

  it("offers a 44px retry control with an accessible name when supplied", () => {
    const onRetry = vi.fn();
    render(<SubmissionMediaProgress items={items} onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "Retry video 5" });
    expect(retry.className).toContain("size-11");

    fireEvent.click(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(items[4]);
  });

  it("explains provider coverage work before individual media jobs exist", () => {
    render(<SubmissionMediaProgress
      items={[]}
      processing={{
        state: "coverage_retry",
        revision: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
        extractionAttempts: 1,
        finalizationAttempts: 0,
      }}
    />);

    expect(screen.getByRole("status").textContent).toContain("Retrieving the full post");
    expect(screen.getByText(/finding every image and video/i)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not claim an unadmitted legacy submission is already queued", () => {
    render(<SubmissionMediaProgress
      items={[]}
      processing={{
        state: "not_started",
        revision: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
        extractionAttempts: 0,
        finalizationAttempts: 0,
      }}
    />);

    expect(screen.getByRole("status").textContent).toContain("Awaiting full media check");
    expect(screen.getByText(/waiting for an operator-reviewed media check/i)).toBeTruthy();
    expect(screen.queryByText(/queued to enter/i)).toBeNull();
  });

  it("polls parent processing state even before media jobs are created", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      submissions: { "legacy-submission": [] },
      processing: {
        "legacy-submission": {
          state: "completed",
          revision: 1,
          total: 0,
          succeeded: 0,
          failed: 0,
          extractionAttempts: 1,
          finalizationAttempts: 0,
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { unmount } = render(
      <SubmissionMediaProgressProvider
        initialProgress={{ "legacy-submission": [] }}
        initialProcessing={{
          "legacy-submission": {
            state: "coverage_processing",
            revision: 0,
            total: 0,
            succeeded: 0,
            failed: 0,
            extractionAttempts: 1,
            finalizationAttempts: 0,
          },
        }}
      >
        <SubmissionMediaProgress
          submissionId="legacy-submission"
          items={[]}
        />
      </SubmissionMediaProgressProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("Media check complete");

    unmount();
    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it("batches active submission polling and stops once every item is terminal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      submissions: {
        "submission-1": [{
          id: "image-1",
          kind: "image",
          ordinal: 1,
          state: "succeeded",
          attempts: 1,
          maxAttempts: 3,
          publicErrorCode: null,
        }],
        "submission-2": [{
          id: "video-2",
          kind: "video",
          ordinal: 1,
          state: "succeeded",
          attempts: 1,
          maxAttempts: 3,
          publicErrorCode: null,
        }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { unmount } = render(
      <SubmissionMediaProgressProvider initialProgress={{
        "submission-1": [items[0]],
        "submission-2": [{ ...items[1], ordinal: 1 }],
      }}>
        <SubmissionMediaProgress items={[items[0]]} submissionId="submission-1" />
        <SubmissionMediaProgress items={[{ ...items[1], ordinal: 1 }]} submissionId="submission-2" />
      </SubmissionMediaProgressProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/spots/social-submissions/media-status?ids=submission-1%2Csubmission-2",
      { cache: "no-store" },
    );
    expect(screen.getAllByText("Complete")).toHaveLength(2);
    expect(screen.getAllByText("1 of 1 finished")).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    fetchMock.mockRestore();
    vi.useRealTimers();
  });
});
