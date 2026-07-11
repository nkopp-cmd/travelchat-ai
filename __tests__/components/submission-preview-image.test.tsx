import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubmissionPreviewImage } from "@/components/spots/submission-preview-image";

describe("SubmissionPreviewImage", () => {
  it("falls back from a failed social image and exposes a truthful empty state", () => {
    render(
      <SubmissionPreviewImage
        src="https://social.example.com/expired.jpg"
        fallbackSrc="/api/places/photo?name=verified"
        title="Verified cafe"
      />,
    );

    const socialImage = screen.getByRole("img", { name: "Verified cafe preview" });
    fireEvent.error(socialImage);
    expect(screen.getByRole("img", { name: "Verified cafe preview" }).getAttribute("src"))
      .toBe("/api/places/photo?name=verified");

    fireEvent.error(screen.getByRole("img", { name: "Verified cafe preview" }));
    expect(screen.getByRole("img", { name: "Verified cafe preview unavailable" })).toBeTruthy();
  });
});
