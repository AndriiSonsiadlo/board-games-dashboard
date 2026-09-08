import os from "node:os";

export interface LanAddress {
  name: string;
  address: string;
}

/** Private IPv4 addresses first, so the Wi-Fi address is usually at the top. */
export function listLanAddresses(): LanAddress[] {
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, infos]) =>
      (infos ?? [])
        .filter((info) => info.family === "IPv4" && !info.internal)
        .map((info) => ({ name, address: info.address })),
    )
    .sort((a, b) => rank(a.address) - rank(b.address) || a.name.localeCompare(b.name));
}
