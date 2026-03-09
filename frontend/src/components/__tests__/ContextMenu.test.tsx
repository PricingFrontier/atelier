import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ContextMenu from "../ui/ContextMenu";
import type { MenuItem } from "../../types";

const mockItems: MenuItem[] = [
  { label: "Categorical", action: vi.fn() },
  { label: "Linear", action: vi.fn() },
  { separator: true, label: "sep" },
  {
    label: "Spline",
    submenu: [
      { label: "df=3", action: vi.fn() },
      { label: "df=4", action: vi.fn() },
    ],
  },
];

describe("ContextMenu", () => {
  it("renders all menu items", () => {
    render(
      <ContextMenu
        pos={{ x: 100, y: 100 }}
        items={mockItems}
        submenuKey={null}
        onSubmenu={vi.fn()}
      />
    );
    expect(screen.getByText("Categorical")).toBeInTheDocument();
    expect(screen.getByText("Linear")).toBeInTheDocument();
    expect(screen.getByText("Spline")).toBeInTheDocument();
  });

  it("calls action on click", () => {
    const action = vi.fn();
    const items: MenuItem[] = [{ label: "Click Me", action }];
    render(
      <ContextMenu pos={{ x: 100, y: 100 }} items={items} submenuKey={null} onSubmenu={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Click Me"));
    expect(action).toHaveBeenCalledOnce();
  });

  it("renders separator", () => {
    const { container } = render(
      <ContextMenu pos={{ x: 100, y: 100 }} items={mockItems} submenuKey={null} onSubmenu={vi.fn()} />
    );
    // Separator is a div with bg-border class
    const separators = container.querySelectorAll(".bg-border");
    expect(separators.length).toBeGreaterThan(0);
  });

  it("calls onSubmenu on hover for items with submenu", () => {
    const onSubmenu = vi.fn();
    render(
      <ContextMenu pos={{ x: 100, y: 100 }} items={mockItems} submenuKey={null} onSubmenu={onSubmenu} />
    );
    fireEvent.mouseEnter(screen.getByText("Spline"));
    expect(onSubmenu).toHaveBeenCalledWith("Spline");
  });

  it("renders submenu when submenuKey matches", () => {
    render(
      <ContextMenu pos={{ x: 100, y: 100 }} items={mockItems} submenuKey="Spline" onSubmenu={vi.fn()} />
    );
    expect(screen.getByText("df=3")).toBeInTheDocument();
    expect(screen.getByText("df=4")).toBeInTheDocument();
  });

  it("does not render submenu when submenuKey is null", () => {
    render(
      <ContextMenu pos={{ x: 100, y: 100 }} items={mockItems} submenuKey={null} onSubmenu={vi.fn()} />
    );
    expect(screen.queryByText("df=3")).not.toBeInTheDocument();
  });
});
