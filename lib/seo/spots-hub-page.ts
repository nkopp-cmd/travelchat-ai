/** Canonical path and title suffix of a /spots hub page; page 1 keeps the bare hub path. */
export function spotsHubPagePath(hubPath: string, rawPage: string | undefined): { page: number; path: string; titleSuffix: string } {
    const n = Number(rawPage);
    const page = Number.isInteger(n) && n > 1 ? n : 1;
    if (page === 1) return { page, path: hubPath, titleSuffix: "" };
    return { page, path: `${hubPath}${hubPath.includes("?") ? "&" : "?"}page=${page}`, titleSuffix: ` (page ${page})` };
}
