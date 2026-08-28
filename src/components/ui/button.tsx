import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent bg-clip-padding text-base font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Violet redesign (J 8/27 下午): brand violet fill + white label
        // (#7029E5 = 6.69:1 light / #7C3AED = 5.70:1 dark, spec §2.2). §2.4:
        // buttons are 6px corners — rounded-full left the button family
        // (only avatars, the AI FAB and status dots keep the pill).
        default:
          "bg-[color:var(--v2-primary-fill)] text-[color:var(--v2-primary-on)] shadow-[var(--v2-shadow-soft)] hover:bg-[color:var(--v2-primary-hover)]",
        // A white border on a near-white glass surface gave outline buttons no
        // perceivable edge (audit: "visually a floating label"). Every Confirm /
        // Edit / Copy / Download control in the app uses this variant, so it now
        // gets a real, visible border and an opaque fill.
        outline:
          "border-[color:var(--v2-outline-border)] bg-white/90 backdrop-blur hover:bg-white hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-white/25 dark:bg-white/10 dark:hover:bg-white/20",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        // var(--v2-primary), not text-primary: the primary token is a FILL
        // colour, and the fill violet as TEXT on a dark card is unreadable.
        // The v2 token brightens in dark mode for exactly this.
        link: "text-[color:var(--v2-primary)] underline-offset-4 hover:underline",
      },
      // ELDERLY-FIRST SIZING (2026-07-28 audit).
      // Our users are 55-80 with imprecise fingers on a phone. The WCAG 2.5.5
      // minimum touch target is 44x44px. Every size below therefore reaches at
      // least 44px of TAPPABLE height, even the ones named "xs"/"sm" — those now
      // mean "visually compact" (smaller text, tighter padding), NOT "small to
      // hit". Callers pass size="sm" all over the app for secondary actions; we
      // must not punish an 80-year-old for that choice, so the sizes stay
      // callable but the height floor is uniform.
      size: {
        default:
          "min-h-11 py-2 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "min-h-11 py-2 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        sm: "min-h-11 py-2 gap-1 px-3.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        lg: "min-h-13 py-2.5 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-11",
        "icon-xs": "size-11 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
