import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

afterEach(() => {
  document.querySelector("[data-main-scroll-host]")?.remove();
});

describe("useScrollDirection", () => {
  it("tracks the canonical content host and resets at its top", () => {
    const scrollHost = document.createElement("main");
    scrollHost.setAttribute("data-main-scroll-host", "");
    document.body.appendChild(scrollHost);

    const { result } = renderHook(() => useScrollDirection({ threshold: 20 }));

    act(() => {
      scrollHost.scrollTop = 30;
      fireEvent.scroll(scrollHost);
    });
    expect(result.current).toBe("down");

    act(() => {
      scrollHost.scrollTop = 60;
      fireEvent.scroll(scrollHost);
    });
    expect(result.current).toBe("down");

    act(() => {
      scrollHost.scrollTop = 30;
      fireEvent.scroll(scrollHost);
    });
    expect(result.current).toBe("up");

    act(() => {
      scrollHost.scrollTop = 5;
      fireEvent.scroll(scrollHost);
    });
    expect(result.current).toBeNull();
  });
});
