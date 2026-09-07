import type { ComponentProps } from "react";
export default function Image({ fill, unoptimized, alt = "", ...props }: ComponentProps<"img"> & { fill?: boolean; unoptimized?: boolean }) {
  void unoptimized;
  // This test adapter intentionally avoids the production Next image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} style={{ ...props.style, ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}) }} />;
}
