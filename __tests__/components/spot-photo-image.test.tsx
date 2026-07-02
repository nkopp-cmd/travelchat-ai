import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpotPhotoImage } from "@/components/spots/spot-photo-image";

describe("SpotPhotoImage", () => {
  it("can show fallback image evidence immediately", () => {
    render(
      <div className="relative">
        <SpotPhotoImage
          src="https://images.unsplash.com/photo-123?w=1200&q=90"
          fallbackSrc="https://images.unsplash.com/photo-fallback?w=1200&q=90"
          alt="Area fallback"
          sizes="320px"
          fallbackBadgeLabel="Image fallback"
          showFallbackBadgeInitially
        />
      </div>,
    );

    expect(screen.getByText("Image fallback")).toBeTruthy();
  });
});
