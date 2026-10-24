import logo from "@/assets/werkandme-logo.png.asset.json";
import logoLight from "@/assets/werkandme-logo-light.png.asset.json";
import icon from "@/assets/werkandme-icon.png.asset.json";
import { cn } from "@/lib/utils";

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <img
      src={light ? logoLight.url : logo.url}
      alt="WerkandMe"
      className={cn("h-7 w-auto", light && "mix-blend-screen", className)}
    />
  );
}

export function BrandIcon({ className }: { className?: string }) {
  return <img src={icon.url} alt="" aria-hidden className={cn("h-6 w-auto", className)} />;
}

export function GradientText({ children }: { children: React.ReactNode }) {
  return <span className="text-brand-gradient">{children}</span>;
}
