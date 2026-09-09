"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Spade } from "lucide-react";
import { formatPoints } from "@/domain/scoring";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { Avatar } from "../common/Avatar";
import { placementsFromOrder, type OrderedEntry } from "./placement";

export function PlacementList({
  order,
  onChange,
  allowTies,
  points,
  jokers,
  players,
}: {
  order: OrderedEntry[];
  onChange: (order: OrderedEntry[]) => void;
  allowTies: boolean;
  points: Map<number, number>;
  jokers: Set<number>;
  players: Map<number, { name: string; color: string }>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const placements = placementsFromOrder(order);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.findIndex((e) => e.playerId === active.id);
    const to = order.findIndex((e) => e.playerId === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(order, from, to));
  };

  if (order.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((e) => e.playerId)} strategy={verticalListSortingStrategy}>
        <ol className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {order.map((entry, index) => (
            <PlacementRow
              key={entry.playerId}
              entry={entry}
              index={index}
              placement={placements[index].placement}
              allowTies={allowTies}
              points={points.get(entry.playerId)}
              joker={jokers.has(entry.playerId)}
              player={players.get(entry.playerId)}
              onUnplace={() => onChange(order.slice(0, index))}
              onToggleTie={() =>
                onChange(order.map((e, i) => (i === index ? { ...e, tiedWithPrevious: !e.tiedWithPrevious } : e)))
              }
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function PlacementRow({
  entry,
  index,
  placement,
  allowTies,
  points,
  joker,
  player,
  onUnplace,
  onToggleTie,
}: {
  entry: OrderedEntry;
  index: number;
  placement: number;
  allowTies: boolean;
  points: number | undefined;
  joker: boolean;
  player: { name: string; color: string } | undefined;
  onUnplace: () => void;
  onToggleTie: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.playerId });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 bg-surface px-1.5 py-1.5", isDragging && "relative z-10 bg-surface-2 shadow-xl")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="grid size-10 shrink-0 touch-none place-items-center text-muted"
        aria-label={t.result.reorder}
      >
        <GripVertical className="size-4" />
      </button>
      <span className={cn("w-7 shrink-0 text-center font-display text-2xl tabular", placement === 1 && "text-accent")}>
        {placement}
      </span>
      <button type="button" onClick={onUnplace} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
        {player ? <Avatar name={player.name} color={player.color} size="sm" /> : null}
        <span className="truncate text-sm">{player?.name ?? entry.playerId}</span>
        {joker ? <Spade className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} /> : null}
      </button>
      {allowTies && index > 0 ? (
        <button
          type="button"
          aria-pressed={entry.tiedWithPrevious}
          onClick={onToggleTie}
          className={cn(
            "h-8 shrink-0 rounded-md border px-2 font-display text-[0.65rem] uppercase tracking-[0.12em]",
            entry.tiedWithPrevious ? "border-accent text-accent" : "border-line text-muted",
          )}
        >
          {t.result.tie}
        </button>
      ) : null}
      <span className={cn("w-12 shrink-0 pr-2 text-right font-mono text-sm tabular", joker ? "text-accent" : "text-text")}>
        {points === undefined ? "" : formatPoints(points)}
      </span>
    </li>
  );
}
