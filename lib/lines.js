export const LINES = [
  { key: "Red", name: "Red Line", hex: "#DA291C", hexDark: "#FF6A5C", tint: "#FBE7E4", tintDark: "#3A2220" },
  { key: "Orange", name: "Orange Line", hex: "#C96A00", hexDark: "#FFA73F", tint: "#FAECD9", tintDark: "#3A2C15" },
  { key: "Blue", name: "Blue Line", hex: "#003DA5", hexDark: "#6F9BFF", tint: "#E2EAFB", tintDark: "#1C2740" },
  { key: "Green", name: "Green Line", hex: "#00713A", hexDark: "#37C980", tint: "#DDF0E3", tintDark: "#143526" },
];

export const LINE_BY_KEY = Object.fromEntries(LINES.map((l) => [l.key, l]));
