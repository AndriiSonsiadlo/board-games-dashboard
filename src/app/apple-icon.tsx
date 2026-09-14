import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0c" }}>
        <svg width="132" height="132" viewBox="0 0 40 40">
          <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="none" stroke="#ece9e2" strokeWidth="1.25" />
          <rect x="13" y="13" width="14" height="14" transform="rotate(45 20 20)" fill="none" stroke="#ece9e2" strokeOpacity="0.45" strokeWidth="1" />
          <circle cx="20" cy="20" r="2.25" fill="#c9a45c" />
        </svg>
      </div>
    ),
    size,
  );
}
