import { BookOpen, FolderGit2, Home } from "lucide-react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { Signature } from "@/components/signature";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Home", url: "/", icon: Home },
  { name: "Projects", url: "/projects", icon: FolderGit2 },
  { name: "Blog", url: "/blog", icon: BookOpen },
];

export function Layout() {
  const isHome = useLocation().pathname === "/";

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Lives here, not in pages, so it mounts (and draws) once per visit. */}
      <header className="flex justify-center pt-8">
        <div
          className={cn(
            "w-full transition-[max-width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            isHome ? "min-w-[200px] max-w-2xl" : "min-w-[160px] max-w-md",
          )}
        >
          <Signature />
        </div>
      </header>
      <Outlet />
      <NavBar items={navItems} />
      <ScrollRestoration />
    </div>
  );
}
