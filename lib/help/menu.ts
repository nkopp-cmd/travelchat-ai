/**
 * Helper 2 "Help me order this" (shared/plans/localley-helper-community.md): a menu photo -> dishes in English.
 * Pure parts only (request body, image checks, response parsing), shared by the API route and the tests.
 *
 * Metered vision call on a live visitor request (subscription-first rule: never a subscription behind a public
 * endpoint). Signed-in only, per-user and global daily caps in app/api/help/menu/route.ts.
 */

export const MENU_MODEL = "gemini-2.5-flash";
export const MENU_MAX_IMAGE_BYTES = 1_500_000;
/** Scans per signed-in user per UTC day. */
export const MENU_USER_DAILY_LIMIT = 10;
/** Scans for all users together per UTC day: worst case ~$0.004 each -> <= ~$0.40/day. */
export const MENU_GLOBAL_DAILY_LIMIT = 100;
export const MENU_MAX_DISHES = 40;

export const MENU_TAGS = [
  "pork", "beef", "chicken", "lamb", "fish", "shellfish", "egg", "dairy", "peanut", "tree_nut", "wheat", "soy",
  "sesame", "alcohol", "spicy", "vegetarian",
] as const;
export type MenuTag = (typeof MENU_TAGS)[number];

export type MenuDish = { original: string; english: string; description: string; price: string | null; tags: MenuTag[] };
export type MenuResult = { language: string | null; dishes: MenuDish[]; notes: string[] };

export type MenuImage = { mime: "image/jpeg" | "image/png" | "image/webp"; data: string };

/** Accepts a base64 JPEG/PNG/WebP and checks the magic bytes (never the claimed type). */
export function parseMenuImage(base64: unknown): MenuImage | null {
  if (typeof base64 !== "string" || base64.length < 100 || base64.length > Math.ceil(MENU_MAX_IMAGE_BYTES / 3) * 4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const head = Uint8Array.from(atob(base64.slice(0, 24)), (c) => c.charCodeAt(0));
  const hex = Array.from(head.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (hex.startsWith("ffd8ff")) return { mime: "image/jpeg", data: base64 };
  if (hex === "89504e47") return { mime: "image/png", data: base64 };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", data: base64 };
  return null;
}

const PROMPT = `You read a restaurant menu photo for a traveller who cannot read the local language.
List every dish or drink you can read on the menu, in menu order, at most ${MENU_MAX_DISHES}.
For each item:
- original: the item name exactly as written on the menu (local script).
- english: a short English name a traveller understands (e.g. "Pork rice soup"), not a romanization.
- description: one short sentence: what it is, main ingredients, how it is served. Use only what the name or menu says
  plus common knowledge of that dish; no marketing words.
- price: the price exactly as written including the currency mark, or null if none is shown.
- tags: only tags from the allowed list that this dish usually contains or is ("spicy", "vegetarian"). Omit a tag when
  unsure.
notes: up to 3 short English notes printed on the menu that matter to a guest (free refills, minimum order, set times).
language: the main language of the menu as an ISO 639-1 code.
If the photo is not a menu or nothing is readable, return an empty dishes list. Never invent items you cannot read.`;

export function menuRequestBody(image: MenuImage) {
  return {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: image.mime, data: image.data } }, { text: PROMPT }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          language: { type: "STRING", nullable: true },
          dishes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                original: { type: "STRING" },
                english: { type: "STRING" },
                description: { type: "STRING" },
                price: { type: "STRING", nullable: true },
                tags: { type: "ARRAY", items: { type: "STRING", enum: [...MENU_TAGS] } },
              },
              required: ["original", "english", "description", "tags"],
            },
          },
          notes: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["dishes", "notes"],
      },
    },
  };
}

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Validates the model output; anything malformed becomes null (the route answers "could not read"). */
export function parseMenuResponse(payload: unknown): MenuResult | null {
  const text = (payload as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
  if (!text) return null;
  let raw: { language?: unknown; dishes?: unknown; notes?: unknown };
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || !Array.isArray(raw.dishes)) return null;
  const allowed = new Set<string>(MENU_TAGS);
  const dishes = raw.dishes.slice(0, MENU_MAX_DISHES).flatMap((item): MenuDish[] => {
    const dish = item as Record<string, unknown>;
    const original = clip(dish.original, 120), english = clip(dish.english, 120);
    if (!original || !english) return [];
    const tags = Array.isArray(dish.tags) ? [...new Set(dish.tags.filter((tag): tag is MenuTag => typeof tag === "string" && allowed.has(tag)))] : [];
    return [{ original, english, description: clip(dish.description, 300), price: clip(dish.price, 40) || null, tags }];
  });
  const notes = Array.isArray(raw.notes) ? raw.notes.map((note) => clip(note, 200)).filter(Boolean).slice(0, 3) : [];
  const language = typeof raw.language === "string" && /^[a-z]{2}$/.test(raw.language) ? raw.language : null;
  return { language, dishes, notes };
}
