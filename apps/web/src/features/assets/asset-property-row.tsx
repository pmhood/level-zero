/**
 * One labelled fact in the inspector's property lists (spec section 21's
 * "Properties" band): label on the left, value on the right, in a panel 320px
 * wide — so the label column is fixed and the value wraps.
 */
export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-faint-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-muted-foreground">{children}</dd>
    </div>
  );
}
