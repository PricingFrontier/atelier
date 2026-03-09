/**
 * Right-click context menu with optional submenus.
 */

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(pos.x, window.innerWidth - 240),
    top: Math.min(pos.y, window.innerHeight - 300),
    zIndex: 100,
    animation: "fadeUp 0.12s ease-out both",
  };

  return (
    <div
      ref={menuRef}
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
          <ContextMenuItem
            key={item.label}
            item={item}
            hasSubmenu={!!hasSubmenu}
            isOpen={isOpen}
            onSubmenu={onSubmenu}
            menuRef={menuRef}
          />
        );
      })}
    </div>
  );
}

function ContextMenuItem({
  item,
  hasSubmenu,
  isOpen,
  onSubmenu,
  menuRef,
}: {
  item: MenuItem;
  hasSubmenu: boolean;
  isOpen: boolean;
  onSubmenu: (key: string | null) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  const getSubmenuStyle = useCallback((): React.CSSProperties => {
    const menu = menuRef.current;
    const row = rowRef.current;
    if (!menu || !row) return {};
    const menuRect = menu.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const submenuWidth = 220;
    // Try right side first, fall back to left if it would overflow
    let left = menuRect.right + 2;
    if (left + submenuWidth > window.innerWidth - 8) {
      left = menuRect.left - submenuWidth - 2;
    }
    // Align top of submenu with the hovered row
    const top = Math.max(8, Math.min(rowRect.top, window.innerHeight - 200));
    return { position: "fixed" as const, left, top, zIndex: 110 };
  }, [menuRef]);

  return (
    <div ref={rowRef} className="relative">
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
        {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
        <div className="flex-1">
          <span>{item.label}</span>
          {item.description && (
            <span className="ml-2 text-[0.65rem] text-muted-foreground/70">
              {item.description}
            </span>
          )}
        </div>
        {hasSubmenu && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />}
      </button>

      {/* Submenu — portalled to body to escape transform-based containing blocks */}
      {hasSubmenu && isOpen && createPortal(
        <div
          className="fixed z-[110] min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/60"
          style={{ ...getSubmenuStyle(), animation: "fadeUp 0.1s ease-out both" }}
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
                {sub.icon && <span className="text-muted-foreground">{sub.icon}</span>}
                <div className="flex-1">
                  <span>{sub.label}</span>
                  {sub.description && (
                    <span className="ml-2 text-[0.65rem] text-muted-foreground/70">
                      {sub.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
