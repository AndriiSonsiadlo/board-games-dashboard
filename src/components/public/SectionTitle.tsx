export function SectionTitle({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 border-b border-line pb-3">
      <span className="font-mono text-xs text-accent">{index}</span>
      <span className="label-caps text-text">{children}</span>
    </h2>
  );
}
