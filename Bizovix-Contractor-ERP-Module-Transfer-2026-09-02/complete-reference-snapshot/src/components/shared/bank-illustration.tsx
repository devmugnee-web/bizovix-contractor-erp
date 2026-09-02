import { cn } from "@/lib/utils";

/**
 * Scalable bank illustration used by the empty states of the Cash & Bank screens.
 * Kept as an SVG on purpose: the previous hand-stacked CSS version overflowed its
 * fixed-height wrapper and painted over the surrounding copy.
 */
export function BankIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 196" role="img" aria-label="Bank illustration" className={cn("h-auto w-full max-w-[300px]", className)}>
      <ellipse cx="160" cy="176" rx="124" ry="14" fill="#eff3f8" />
      <path d="M160 16 L288 68 H32 Z" fill="#e9eef5" />
      <path d="M160 30 L252 64 H68 Z" fill="#f8fafc" />
      <circle cx="160" cy="52" r="7" fill="#fff1e2" />
      <path d="M160 47 L164 55 H156 Z" fill="#e67817" />
      <rect x="44" y="68" width="232" height="11" rx="3" fill="#dde4ee" />
      <rect x="52" y="79" width="216" height="8" rx="2" fill="#eaeff6" />
      {[68, 110, 152, 194].map((x) => (
        <g key={x}>
          <rect x={x} y="87" width="24" height="62" rx="2" fill="#f4f7fb" />
          <rect x={x + 4} y="87" width="3" height="62" fill="#e3e9f1" />
          <rect x={x + 17} y="87" width="3" height="62" fill="#e3e9f1" />
        </g>
      ))}
      <rect x="146" y="105" width="28" height="44" rx="3" fill="#cfd9e6" />
      <rect x="52" y="149" width="216" height="10" rx="2" fill="#dde4ee" />
      <rect x="42" y="159" width="236" height="11" rx="3" fill="#d3dbe7" />
      <g fill="#ffd45f" stroke="#e0ad23" strokeWidth="3">
        <circle cx="42" cy="118" r="15" />
        <circle cx="278" cy="106" r="13" />
        <circle cx="264" cy="144" r="11" />
      </g>
      <g fill="#8b6500" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" textAnchor="middle">
        <text x="42" y="123" fontSize="11">
          Tk
        </text>
        <text x="278" y="111" fontSize="10">
          Tk
        </text>
        <text x="264" y="148" fontSize="9">
          Tk
        </text>
      </g>
    </svg>
  );
}
