import type { SVGProps } from "react"

export type NavIconName = "overview" | "ledger" | "rules" | "categories" | "insights" | "budgets" | "settings"

/** Small, matched line drawings for the instrument-panel navigation. */
export function NavIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>
      {name === "overview" ? <><path d="M3 18h18"/><path d="M5 15.5 9 11l3 2.5 6-7"/><circle cx="18" cy="6.5" r="1.2"/></> : null}
      {name === "ledger" ? <><path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M3 7v14h14"/></> : null}
      {name === "rules" ? <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="7" cy="18" r="2" fill="var(--panel)"/></> : null}
      {name === "categories" ? <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></> : null}
      {name === "insights" ? <><path d="M3 12s3.1-6 9-6 9 6 9 6-3.1 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/><path d="m10.5 13.5 1.1-1.4 1.2.6 1.2-2"/></> : null}
      {name === "budgets" ? <><path d="M4.5 18a8 8 0 1 1 15 0"/><path d="M12 12l4-3M6 18h12"/><circle cx="12" cy="12" r="1"/></> : null}
      {name === "settings" ? <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.8-1.2 2.1-1.3-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.4h-2.5l-.3-1.4a7.8 7.8 0 0 1-1.5-.9l-1.3.5-1.2-2.1 1.1-.8a7.2 7.2 0 0 1 0-1.8l-1.1-.8 1.2-2.1 1.3.5a7.8 7.8 0 0 1 1.5-.9l.3-1.4h2.5l.2 1.4a7.8 7.8 0 0 1 1.5.9l1.3-.5 1.2 2.1-1.1.8a7.2 7.2 0 0 1 0 1.8Z" transform="translate(-1 -1) scale(1.08)"/></> : null}
    </svg>
  )
}
