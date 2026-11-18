/** 83200 -> "1:23.2" */
export function formatTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/** Peg colors with a symbol each, so the game is playable without color vision. */
export const PEG_COLORS = [
  { name: "Red", hex: "#e5484d", symbol: "●" },
  { name: "Blue", hex: "#3e8ef7", symbol: "■" },
  { name: "Green", hex: "#30a46c", symbol: "▲" },
  { name: "Yellow", hex: "#f5d90a", symbol: "◆" },
  { name: "Orange", hex: "#f76b15", symbol: "★" },
  { name: "Purple", hex: "#8e4ec6", symbol: "✚" },
  { name: "Cyan", hex: "#12a5c7", symbol: "◗" },
  { name: "Pink", hex: "#e93d82", symbol: "♥" },
] as const;
