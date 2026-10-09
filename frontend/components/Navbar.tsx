"use client";

import { Bell, CalendarDays, House, MessageCircle, Search, Settings, Users, Video } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { User } from "@/types/meeting";

// Only "Home" is part of this assignment; the other tabs are visual placeholders like the real app.
const NAV_ITEMS = [
  { label: "Home", icon: House },
  { label: "Meetings", icon: CalendarDays },
  { label: "Team Chat", icon: MessageCircle },
  { label: "Contacts", icon: Users },
];

interface NavbarProps {
  user: User | null; // null while loading
  onSignOut: () => void;
  onOpenSettings: () => void;
  onPlaceholderClick: (feature: string) => void;
}

export function Navbar({ user, onSignOut, onOpenSettings, onPlaceholderClick }: NavbarProps) {
  const name = user?.name ?? "";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Zoom Clone home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zoom-blue text-white">
            <Video size={18} fill="currentColor" strokeWidth={1.5} />
          </span>
          <span className="hidden text-[19px] font-bold tracking-tight text-zoom-blue sm:block">
            zoom <span className="font-medium text-ink-muted">clone</span>
          </span>
        </Link>

        <nav aria-label="Main" className="flex flex-1 justify-center gap-1">
          {NAV_ITEMS.map(({ label, icon: Icon }) => {
            const active = label === "Home";
            return (
              <button
                key={label}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => !active && onPlaceholderClick(label)}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors md:px-4 ${
                  active ? "text-zoom-blue" : "text-ink-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="hidden sm:block">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onPlaceholderClick("Search")}
            className="hidden h-9 w-56 items-center gap-2 rounded-lg bg-canvas px-3 text-sm text-ink-muted hover:bg-[#eef0f3] lg:flex"
          >
            <Search size={16} />
            Search
            <kbd className="ml-auto font-sans text-xs">⌘F</kbd>
          </button>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => onPlaceholderClick("Notifications")}
            className="hidden rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink sm:block"
          >
            <Bell size={20} />
          </button>
          <button
            type="button"
            aria-label="Settings"
            onClick={onOpenSettings}
            className="rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink"
          >
            <Settings size={20} />
          </button>

          {/* Profile menu: native <details> gives open/close without extra state. */}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded-lg p-1 hover:bg-canvas [&::-webkit-details-marker]:hidden">
              <span className="relative">
                <Avatar name={name || " "} size={32} />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-zoom-green" />
              </span>
              <span className="sr-only">Profile menu</span>
            </summary>
            <div className="animate-pop-in absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-xl">
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar name={name || " "} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                  <span className="mt-1 inline-block rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                    Basic
                  </span>
                </div>
              </div>
              <hr className="my-1 border-line" />
              {["Profile", "Settings"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open"); // close the menu
                    onOpenSettings();
                  }}
                  className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-canvas"
                >
                  {item}
                </button>
              ))}
              <hr className="my-1 border-line" />
              <button type="button" onClick={onSignOut} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-canvas">
                Sign out
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
