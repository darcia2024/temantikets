import Image from "next/image";

const RATIO = 433 / 102; // original lockup: mark + "temantiket" + "mudah, cepat, amanah"

/** Official Temantiket logo lockup. `size` is the rendered height in px. */
export function Logo({
  tone = "blue",
  size = 32,
  className = "",
}: {
  tone?: "blue" | "white";
  size?: number;
  /** kept for older call sites; the tagline is part of the lockup */
  tagline?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={tone === "white" ? "/brand/logo-white.png" : "/brand/logo-blue.png"}
      alt="temantiket - mudah, cepat, amanah"
      width={Math.round(size * RATIO)}
      height={size}
      priority
      className={className}
      // Fixed width keeps the ratio even inside stretching flex containers.
      style={{ height: size, width: Math.round(size * RATIO), maxWidth: "none", flexShrink: 0 }}
    />
  );
}
