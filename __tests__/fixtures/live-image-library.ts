// A live theme x light library for route tests, independent of the shipped manifest state.
const THEMES = ["cafe", "food", "nature", "culture", "nightlife", "shopping", "neighborhood"];
export async function liveImageLibrary(orig: () => Promise<unknown>) {
  const real = ((await orig()) as { default: { activity: object } }).default;
  const set = Object.fromEntries(THEMES.flatMap((t, i) =>
    ["day", "night"].map((l, j) => [`${t}-${l}`, `/media/story/${String(i * 2 + j + 1).padStart(64, "0")}.jpg`])));
  return { default: { live: true, story: { seoul: set, tokyo: set }, activity: real.activity, retired: [] } };
}
