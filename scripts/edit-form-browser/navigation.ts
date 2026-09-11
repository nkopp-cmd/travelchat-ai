// Navigation is the only replaced application boundary. No Next server runs.
export function useRouter() {
  return { push(path: string) { throw new Error(`Unexpected fixture navigation: ${path}`); } };
}
