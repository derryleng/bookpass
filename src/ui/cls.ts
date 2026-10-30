// Tailwind class strings used in many places. Anything used once stays inline in the component.

const buttonSize = {
  normal: "px-3 py-1.5",
  small: "px-2.5 py-1 text-[13px]",
  square: "size-8 p-0",
  tiny: "size-6 p-0 text-[13px]",
};

const buttonLook = {
  normal: "bg-surface text-fg hover:not-disabled:bg-raised",
  primary:
    "bg-accent border-accent text-on-accent hover:not-disabled:brightness-110",
  danger: "bg-surface text-danger hover:not-disabled:bg-raised",
  ghost:
    "border-transparent bg-transparent text-fg hover:not-disabled:bg-raised",
  active: "border-transparent bg-accent-soft text-accent-strong",
  star: "border-transparent bg-transparent text-star hover:not-disabled:bg-raised",
  quiet:
    "border-transparent bg-transparent text-muted hover:not-disabled:bg-raised",
  bulk: "border-transparent bg-white/15 text-inherit hover:not-disabled:bg-white/25",
};

/** A button. `mods` is any of: primary, danger, ghost, quiet, active, bulk, small, square, tiny. */
export function btn(mods = "") {
  const m = new Set(mods.split(" "));
  const look = (
    ["primary", "danger", "ghost", "quiet", "star", "active", "bulk"] as const
  ).find((k) => m.has(k));
  const size = m.has("small")
    ? "small"
    : m.has("square")
      ? "square"
      : m.has("tiny")
        ? "tiny"
        : "normal";
  return `inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line font-medium whitespace-nowrap disabled:cursor-default disabled:opacity-55 ${buttonSize[size]} ${buttonLook[look ?? "normal"]}`;
}

const inputShape =
  "rounded-lg border text-fg focus:border-transparent focus:outline-2 focus:-outline-offset-1 focus:outline-accent";

/** Text boxes, selects and text areas. */
export const input = `w-full px-2.5 py-2 ${inputShape} border-line bg-surface`;
/** The same, sized to its content, for toolbars. */
export const inputSmall = `w-auto px-2 py-1.5 ${inputShape} border-line bg-surface`;
/** The search box: tinted until focused. */
export const inputSearch = `w-full py-2 pr-2.5 pl-8 ${inputShape} border-transparent bg-raised`;

/** A label that stacks its caption over a control. */
export const field =
  "flex flex-col gap-1.5 [&>span]:text-xs [&>span]:font-semibold [&>span]:text-muted";

/** A small heading over a control. */
export const caption = "text-xs font-semibold text-muted";

export const hint = "text-xs text-muted";

const calloutLook = {
  info: "bg-raised",
  error: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
};

/** A box with a message. Its icon, if any, is the first child. */
export const callout = (look: keyof typeof calloutLook = "info") =>
  `flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px] [&>svg]:mt-1 ${calloutLook[look]}`;

/** A white panel with a border, such as a settings section. */
export const panel = "rounded-xl border border-line bg-surface px-5 py-4";

/** A row of connected choices, such as the layout switch. Each choice is a `segment`. */
export const segmented = "flex gap-0.5 rounded-[9px] bg-raised p-0.5";

export const segment = (active: boolean) =>
  `inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1 font-medium whitespace-nowrap ${active ? "bg-surface text-accent-strong shadow-card" : "text-fg hover:bg-surface/60"}`;

/** A drop down menu built on <details>: the summary opens a list of items. */
export const menu = "relative";
export const menuTrigger =
  "list-none cursor-pointer [&::-webkit-details-marker]:hidden";
export const menuList =
  "absolute right-0 z-5 mt-1.5 flex min-w-50 flex-col rounded-[10px] border border-line bg-surface p-1.5 shadow-card";
export const menuItem =
  "flex w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-fg hover:bg-raised";

/** What a bookmark or folder shows while something is dragged over it. */
export const dropTarget =
  "outline-2 -outline-offset-2 outline-dashed outline-accent bg-accent-soft";

/** A row of the sidebar. */
export const navItem = (active: boolean) =>
  `flex min-h-8.5 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1 text-left [&>svg]:w-[1.1em] ${active ? "bg-accent-soft font-semibold text-accent-strong" : "text-fg hover:bg-raised [&>svg]:text-muted"}`;

/** The number at the end of a sidebar row. */
export const countLabel = "ml-auto text-xs font-medium text-muted";

/** A small capitals heading over a list. */
export const sectionTitle =
  "mx-2.5 mt-4.5 mb-1.5 flex items-center justify-between text-xs font-bold tracking-wide text-muted uppercase";

/** A file path or address, in a fixed width font. */
export const path = "font-mono text-xs break-all";

/** The clickable line of a <details> that holds less important content. */
export const summaryLabel = "cursor-pointer text-xs font-semibold text-muted";
