/** Placeholder for views landing in later milestones. */

export function PlaceholderView({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <div className="card empty">{note}</div>
    </div>
  )
}
