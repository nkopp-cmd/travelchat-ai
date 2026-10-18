import type { Icon, IconProps } from '@phosphor-icons/react/dist/lib/types';
import { XIcon as PhosphorX } from '@phosphor-icons/react/dist/ssr/X';
import { HeartIcon as PhosphorHeart } from '@phosphor-icons/react/dist/ssr/Heart';
import { CompassIcon as PhosphorCompass } from '@phosphor-icons/react/dist/ssr/Compass';
import { MapTrifoldIcon as PhosphorMap } from '@phosphor-icons/react/dist/ssr/MapTrifold';
import { ChatCircleDotsIcon as PhosphorChat } from '@phosphor-icons/react/dist/ssr/ChatCircleDots';

import { ArrowRightIcon as PhosphorArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ListIcon as PhosphorMenu } from '@phosphor-icons/react/dist/ssr/List';
import { MedalIcon as PhosphorAward } from '@phosphor-icons/react/dist/ssr/Medal';
import { GearSixIcon as PhosphorSettings } from '@phosphor-icons/react/dist/ssr/GearSix';
import { CreditCardIcon as PhosphorCreditCard } from '@phosphor-icons/react/dist/ssr/CreditCard';
import { SparkleIcon as PhosphorSparkles } from '@phosphor-icons/react/dist/ssr/Sparkle';
import { MagnifyingGlassIcon as PhosphorSearch } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';

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

export const ArrowRight = /* #__PURE__ */ duotone(PhosphorArrowRight);
export const Menu = /* #__PURE__ */ duotone(PhosphorMenu);
export const Award = /* #__PURE__ */ duotone(PhosphorAward);
export const Settings = /* #__PURE__ */ duotone(PhosphorSettings);
export const CreditCard = /* #__PURE__ */ duotone(PhosphorCreditCard);
export const Sparkles = /* #__PURE__ */ duotone(PhosphorSparkles);
export const Search = /* #__PURE__ */ duotone(PhosphorSearch);
