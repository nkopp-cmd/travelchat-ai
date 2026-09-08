import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

// Derived review artifacts only. This never creates or changes application assets.
const root = resolve("test-results/story-studio-browser");
for (const directory of await readdir(root)) {
  if (!directory.endsWith("real-components-and-all-video-states")) continue;
  const files = (await readdir(`${root}/${directory}`)).filter(file => file.endsWith(".png")).sort();
  const tiles = [];
  for (const [index, file] of files.entries()) {
    const x = (index % 4) * 360;
    const y = Math.floor(index / 4) * 440;
    tiles.push({ input: await sharp(`${root}/${directory}/${file}`).resize(350, 410, { fit: "contain", background: "white" }).png().toBuffer(), left: x, top: y + 25 });
    tiles.push({ input: Buffer.from(`<svg width="350" height="25"><text x="8" y="18" font-size="16">${file}</text></svg>`), left: x, top: y });
  }
  await sharp({ create: { width: 1440, height: Math.ceil(files.length / 4) * 440, channels: 3, background: "white" } }).composite(tiles).png().toFile(`${root}/${directory}/../${directory}-sheet.png`);
}
