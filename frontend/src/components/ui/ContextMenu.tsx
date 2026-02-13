/**
 * Right-click context menu with optional submenus.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MenuPos, MenuItem } from "@/types";

export default function ContextMenu({
  pos,
  items,
  submenuKey,
  onSubmenu,
}: {
  pos: MenuPos;
  items: MenuItem[];
  submenuKey: string | null;
  onSubmenu: (key: string | null) => void;
}) {
  // Clamp to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(pos.x, window.innerWidth - 240),
    top: Math.min(pos.y, window.innerHeight - 300),
    zIndex: 55,
    animation: "fadeUp 0.12s ease-out both",
  };

  return (
    <div
      style={style}
      className="fixed z-[100] min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/60"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} className="mx-2 my-1 h-px bg-border" />;
        }

        const hasSubmenu = item.submenu && item.submenu.length > 0;
        const isOpen = submenuKey === item.label;

        return (
          <div key={item.label} className="relative">
            <button
              onMouseEnter={() => hasSubmenu && onSubmenu(item.label)}
              onMouseLeave={() => {/* submenu stays open */}}
              onClick={(e) => {
                e.stopPropagation();
                if (item.action) item.action();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isOpen
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {item.icon && <span className="text-muted-foreground/60">{item.icon}</span>}
              <div className="flex-1">
                <span>{item.label}</span>
                {item.description && (
                  <span className="ml-2 text-[0.65rem] text-muted-foreground/40">
                    {item.description}
                  </span>
                )}
              </div>
              {hasSubmenu && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
            </button>

            {/* Submenu */}
            {hasSubmenu && isOpen && (
              <div
                className="absolute top-0 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/60"
                style={{ animation: "fadeUp 0.1s ease-out both" }}
                onClick={(e) => e.stopPropagation()}
              >
                {item.submenu!.map((sub, j) => {
                  if (sub.separator) {
                    return <div key={`sub-sep-${j}`} className="my-1 h-px bg-border" />;
                  }
                  return (
                    <button
                      key={sub.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sub.action) sub.action();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {sub.icon && <span className="text-muted-foreground/60">{sub.icon}</span>}
                      <div className="flex-1">
                        <span>{sub.label}</span>
                        {sub.description && (
                          <span className="ml-2 text-[0.65rem] text-muted-foreground/40">
                            {sub.description}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
