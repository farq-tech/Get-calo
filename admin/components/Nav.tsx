"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/models", label: "Models" },
  { href: "/feedback", label: "Feedback" },
  { href: "/dataset", label: "Dataset" },
  { href: "/training", label: "Training" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="brand-lockup">
        <Link href="/" className="brand-mark">
          SnapCal
        </Link>
        <span className="brand-sub">Ops</span>
      </div>
      <nav className="site-nav" aria-label="Primary">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "nav-link active" : "nav-link"}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
