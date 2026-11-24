// Shared (server + client) formatting helpers.
export const money = (minor: number | null | undefined, currency = "GHS") =>
  minor == null ? "—" : `${currency} ${(minor / 100).toLocaleString("en-GH", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
