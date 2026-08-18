// utils/ipUtils.js
import geoip from "geoip-lite";

// Normalize IPv4 mapped in IPv6 (e.g., ::ffff:1.2.3.4)
export function getClientIp(req) {
  // Make sure in app.js: app.set('trust proxy', 1)
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : (xf?.split(",")[0] || req.ip || "");
  return raw.replace(/^::ffff:/, "");
}

export function lookupGeo(ip) {
  const g = geoip.lookup(ip);
  if (!g) return null;
  const [lat, lon] = g.ll || [];
  return {
    country: g.country || null,
    region:  g.region  || null,
    city:    g.city    || null,
    lat, lon,
    tz:      g.timezone || null,
  };
}
