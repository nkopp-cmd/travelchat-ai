import type { Icon, IconProps } from '@phosphor-icons/react/dist/lib/types';
import { XIcon as PhosphorX } from '@phosphor-icons/react/dist/ssr/X';
import { HeartIcon as PhosphorHeart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CompassIcon as PhosphorCompass } from '@phosphor-icons/react/dist/ssr/Compass';
import { MapTrifoldIcon as PhosphorMap } from '@phosphor-icons/react/dist/ssr/MapTrifold';
import { ChatCircleDotsIcon as PhosphorChat } from '@phosphor-icons/react/dist/ssr/ChatCircleDots';

// Context-free SSR modules also work inside client components. Keep per-icon imports.
function duotone(Glyph: Icon) {
  return function LocalleyIcon({ weight = 'duotone', ...props }: IconProps) {
    return <Glyph aria-hidden={props['aria-label'] || props.alt ? undefined : true} {...props} weight={weight} />;
  };
}

export const XIcon = /* #__PURE__ */ duotone(PhosphorX);
export const Heart = /* #__PURE__ */ duotone(PhosphorHeart);
export const Compass = /* #__PURE__ */ duotone(PhosphorCompass);
export const Map = /* #__PURE__ */ duotone(PhosphorMap);
export const MessageCircle = /* #__PURE__ */ duotone(PhosphorChat);
