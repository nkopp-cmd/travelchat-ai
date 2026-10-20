import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";

describe("lazy toaster", () => {
  it("renders nothing until the first toast, then shows it", async () => {
    const { container } = render(<Toaster />);
    expect(container.innerHTML).toBe("");
    act(() => { toast({ title: "Trip saved" }); });
    expect(await screen.findByText("Trip saved", undefined, { timeout: 5000 })).not.toBeNull();
  });

  it("keeps Radix Toast out of the shared toaster module", () => {
    const source = readFileSync("components/ui/toaster.tsx", "utf8");
    expect(source).not.toMatch(/from "@\/components\/ui\/toast"|@radix-ui/);
    expect(source).toMatch(/import\("@\/components\/ui\/radix-toaster"\)/);
  });
});
