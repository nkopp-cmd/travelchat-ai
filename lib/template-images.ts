// Push CH1: kept apart from lib/templates.ts so the planner (planner-query -> getTemplateById) does not ship
// lib/city-images in its first-load JS. Only the template cards and picker need the image URLs.
import { getCityImageUrl } from "@/lib/city-images";
import { getTemplateSampleCity, type ItineraryTemplate } from "@/lib/templates";

export function getTemplateImageUrl(
  template: ItineraryTemplate,
  options: { width?: number; height?: number; quality?: number } = {}
): string {
  const city = getTemplateSampleCity(template);
  return (
    getCityImageUrl(city, {
      width: options.width || 480,
      height: options.height || 360,
      quality: options.quality || 88,
    }) ||
    getCityImageUrl("Tokyo", {
      width: options.width || 480,
      height: options.height || 360,
      quality: options.quality || 88,
    }) ||
    "/images/placeholders/default.svg"
  );
}
