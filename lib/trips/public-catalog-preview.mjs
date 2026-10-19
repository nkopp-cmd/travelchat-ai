/** Project existing visibility-filtered public Spot DTOs, never raw/private rows.
 * This is not an authorization or visibility filter. The caller must use the
 * existing public catalog reader first. No geocoding, photos or model calls.
 */
export function projectPublicCatalogPreview(rows, citySlug) {
  if (typeof citySlug !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(citySlug))
    throw new Error('Invalid preview city');
  if (!Array.isArray(rows) || rows.length > 24) throw new Error('Preview input exceeds one catalog page');
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 &&
    value.trim().length <= max ? value.trim() : null;
  const ids = new Set(), names = new Set(), spots = [], areas = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || row.citySlug !== citySlug ||
        typeof row.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id)) continue;
    const name = text(row.name, 200), category = text(row.category, 80);
    if (!name || !category) continue;
    const normalizedName = name.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ');
    if (ids.has(row.id) || names.has(normalizedName)) continue;
    ids.add(row.id); names.add(normalizedName);
    const area = text(row.areaName, 160);
    spots.push({ id: row.id, name, category, ...(area ? { area } : {}), href: `/spots/${row.id}` });
    if (area && !areas.includes(area)) areas.push(area);
    if (spots.length === 3) break;
  }
  return { spots, areas };
}
