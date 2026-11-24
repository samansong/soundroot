// Minimal inline icon set (stroke icons, currentColor).
import type { SVGProps } from "react";

const I = (d: React.ReactNode) =>
  function Icon(p: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
        {d}
      </svg>
    );
  };

export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" /></svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><rect x="6" y="4" width="4.5" height="16" rx="1.2" /><rect x="13.5" y="4" width="4.5" height="16" rx="1.2" /></svg>
);
export const IconNext = I(<><path d="M5 5l10 7-10 7V5Z" fill="currentColor" /><path d="M19 5v14" /></>);
export const IconPrev = I(<><path d="M19 5L9 12l10 7V5Z" fill="currentColor" /><path d="M5 5v14" /></>);
export const IconSearch = I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconWave = I(<path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h-2" />);
export const IconMic = I(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>);
export const IconFolder = I(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />);
export const IconBag = I(<><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>);
export const IconGrid = I(<><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>);
export const IconSliders = I(<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />);
export const IconShield = I(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />);
export const IconBell = I(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>);
export const IconUser = I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconHome = I(<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />);
export const IconCalendar = I(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconDownload = I(<path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" />);
export const IconUpload = I(<path d="M12 20V8m0 0-4 4m4-4 4 4M4 4h16" />);
export const IconLock = I(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>);
export const IconUnlock = I(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>);
export const IconCheck = I(<path d="M5 12l5 5L20 7" />);
export const IconX = I(<path d="M6 6l12 12M18 6 6 18" />);
export const IconPlus = I(<path d="M12 5v14M5 12h14" />);
export const IconFlag = I(<path d="M5 21V4m0 0h11l-2 4 2 4H5" />);
export const IconVolume = I(<><path d="M4 9h4l5-4v14l-5-4H4V9Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>);
export const IconLogout = I(<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10" />);
export const IconPin = I(<><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>);
export const IconMessage = I(<path d="M4 5h16v11H9l-5 4V5Z" />);
export const IconChart = I(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);
export const IconUsers = I(<><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a6 6 0 0 1 4 6" /></>);
export const IconSettings = I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>);
export const IconArrow = I(<path d="M5 12h14m-6-6 6 6-6 6" />);
export const IconDoc = I(<><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>);
export const IconCard = I(<><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>);
export const IconPhone = I(<><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>);
export const IconSparkle = I(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />);

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffd27a" /><stop offset="1" stopColor="#3fd1b3" /></linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="none" stroke="url(#lg)" strokeWidth="2" />
      {[6, 10, 14, 18, 22, 26].map((x, i) => (
        <rect key={x} x={x - 1} y={16 - [4, 8, 11, 7, 9, 3][i]} width="2" height={[4, 8, 11, 7, 9, 3][i] * 2} rx="1" fill={i % 2 ? "#3fd1b3" : "#f2b84b"} />
      ))}
    </svg>
  );
}
