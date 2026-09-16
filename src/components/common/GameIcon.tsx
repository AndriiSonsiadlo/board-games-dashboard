import { Dices } from "lucide-react";
import { GAME_ICONS } from "./gameIcons";

export { GAME_ICONS };

export function GameIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GAME_ICONS[name] ?? Dices;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
