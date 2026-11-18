import { PEG_COLORS } from "@/lib/format";

interface PegProps {
  color: number | null;
  hidden?: boolean;
  onClick?: () => void;
  label?: string;
  size?: "md" | "lg";
}

export function Peg({ color, hidden, onClick, label, size = "md" }: PegProps) {
  const c = color === null ? null : PEG_COLORS[color];
  const className = `peg peg-${size}${c ? " peg-filled" : ""}${hidden ? " peg-hidden" : ""}`;
  const style = c && !hidden ? { background: c.hex } : undefined;
  const content = hidden ? "?" : c?.symbol ?? "";
  const ariaLabel = label ?? (hidden ? "Hidden peg" : c ? c.name : "Empty");

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }
  return (
    <span className={className} style={style} role="img" aria-label={ariaLabel}>
      {content}
    </span>
  );
}

export function Feedback({ black, white, pegs }: { black: number; white: number; pegs: number }) {
  const keys = [
    ...Array(black).fill("black"),
    ...Array(white).fill("white"),
    ...Array(Math.max(0, pegs - black - white)).fill("none"),
  ];
  return (
    <span
      className="feedback"
      style={{ gridTemplateColumns: `repeat(${Math.ceil(pegs / 2)}, 1fr)` }}
      role="img"
      aria-label={`${black} correct position, ${white} correct color wrong position`}
    >
      {keys.map((k, i) => (
        <span key={i} className={`key key-${k}`} />
      ))}
    </span>
  );
}
