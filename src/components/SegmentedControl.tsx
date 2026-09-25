/** `2k`/`1g`'s pill-shaped toggle (unlock timing, reveal rule) — two call
 * sites, so per 08-component-inventory.md's own rule this stays local
 * rather than moving into @jfc/ui-web. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`segmented-option${o.value === value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
