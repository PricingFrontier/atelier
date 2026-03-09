import { useState, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
}

export interface SelectDropdownProps {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  allowNone?: boolean;
}

export const SelectDropdown = memo(function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = "Select\u2026",
  allowNone = false,
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260) {
        setPos({ left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 6 });
      } else {
        setPos({ left: rect.left, width: rect.width, top: rect.bottom + 6 });
      }
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
          open
            ? "border-primary/30 bg-surface-hover ring-1 ring-primary/20"
            : "border-border bg-surface hover:bg-surface-hover"
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground/60"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[1000] max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-2xl shadow-black/50"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              animation: "fadeUp 0.15s ease-out both",
            }}
          >
            {allowNone && (
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                None
              </button>
            )}
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  opt.value === value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.badge && (
                  <span className="rounded-md bg-accent px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
                    {opt.badge}
                  </span>
                )}
                {opt.description && (
                  <span className="text-[0.65rem] text-muted-foreground/40">{opt.description}</span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
});
