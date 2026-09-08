import { Castle, Dices, Gem, Hexagon, Landmark, Layers, Music, Rat, Spade, TrainFront, type LucideIcon } from "lucide-react";

export const GAME_ICONS: Record<string, LucideIcon> = {
  Castle,
  Dices,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Spade,
  TrainFront,
};

export function GameIcon({ name, className }: { name: string; className?: string }) {
  const Icon = GAME_ICONS[name] ?? Dices;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
