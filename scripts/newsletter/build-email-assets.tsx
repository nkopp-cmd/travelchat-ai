// Builds the static images that newsletter emails reference (public/email/v1/).
// Email clients do not render SVG and handle WebP badly, so icons become PNG and photos become JPEG.
// Run: npx tsx scripts/newsletter/build-email-assets.tsx   (output is committed; filenames are versioned, cache immutable)
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Camera } from "../../components/ui/icon-glyphs/Camera";
import { CreditCard } from "../../components/ui/icon-glyphs/CreditCard";
import { CrownSimple } from "../../components/ui/icon-glyphs/CrownSimple";
import { Fire } from "../../components/ui/icon-glyphs/Fire";
import { Heart } from "../../components/ui/icon-glyphs/Heart";
import { MapPin } from "../../components/ui/icon-glyphs/MapPin";
import { Sparkle } from "../../components/ui/icon-glyphs/Sparkle";
import { Train } from "../../components/ui/icon-glyphs/Train";
import { TrendUp } from "../../components/ui/icon-glyphs/TrendUp";
import { UsersThree } from "../../components/ui/icon-glyphs/UsersThree";
import { Warning } from "../../components/ui/icon-glyphs/Warning";
import { EMAIL_ICONS } from "../../emails/newsletter-assets";

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public/email/v1");

const GLYPHS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Warning, Camera, UsersThree, Heart, Sparkle, CrownSimple, CreditCard, MapPin, TrendUp, Fire, Train,
};

async function icons() {
  for (const icon of EMAIL_ICONS) {
    const Glyph = GLYPHS[icon.glyph];
    if (!Glyph) throw new Error(`missing glyph ${icon.glyph}`);
    const svg = renderToStaticMarkup(<Glyph size={256} color={icon.color} />);
    await sharp(Buffer.from(svg)).resize(96, 96).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${icon.file}`));
  }
}

async function photos() {
  const picks = path.join(ROOT, "public/images/picks");
  for (const city of ["seoul", "tokyo", "bangkok", "singapore"]) {
    await sharp(path.join(picks, `${city}-pick-v1-960.webp`))
      .resize(960, 640, { fit: "cover" })
      .jpeg({ quality: 68, mozjpeg: true, progressive: true })
      .toFile(path.join(OUT, `${city}-hero.jpg`));
    await sharp(path.join(picks, `${city}-pick-v1-960.webp`))
      .resize(480, 320, { fit: "cover" })
      .jpeg({ quality: 70, mozjpeg: true, progressive: true })
      .toFile(path.join(OUT, `${city}-card.jpg`));
  }
  await sharp(path.join(ROOT, "public/icons/apple-touch-icon.png")).resize(96, 96).png().toFile(path.join(OUT, "logo.png"));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await icons();
  await photos();
  console.log(`email assets written to ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
