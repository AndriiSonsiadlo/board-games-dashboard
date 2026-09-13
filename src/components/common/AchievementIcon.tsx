import {
  Armchair,
  Award,
  Bird,
  Castle,
  Flag,
  Flame,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Repeat,
  Shapes,
  Spade,
  Sprout,
  Swords,
  Timer,
  TrainFront,
  TrendingUp,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { achievementDef, type AchievementId } from "@/domain/achievements";

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Bird,
  Castle,
  Flag,
  Flame,
  Gem,
  Hexagon,
  Landmark,
  Layers,
  Music,
  Rat,
  Repeat,
  Shapes,
  Spade,
  Sprout,
  Swords,
  Timer,
  TrainFront,
  TrendingUp,
  Trophy,
  Users,
  Zap,
};

export function AchievementIcon({ id, className }: { id: AchievementId; className?: string }) {
  const Icon = ICONS[achievementDef(id).icon] ?? Award;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
