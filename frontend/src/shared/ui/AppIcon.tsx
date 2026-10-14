import type { ReactElement, SVGProps } from 'react';

type AppIconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  src: string;
  alt: string;
};

type IconName =
  | 'alert'
  | 'bell'
  | 'calendar'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'clipboard'
  | 'close'
  | 'dots'
  | 'download'
  | 'file-pdf'
  | 'file-ppt'
  | 'file-search'
  | 'file-text'
  | 'filter'
  | 'folder'
  | 'folder-active'
  | 'home'
  | 'log-out'
  | 'mail'
  | 'mic-white'
  | 'plus'
  | 'report'
  | 'settings'
  | 'sparkles'
  | 'star'
  | 'status-1'
  | 'status-2'
  | 'status-3'
  | 'status-4'
  | 'status-5'
  | 'triangle-down'
  | 'triangle-right'
  | 'upload'
  | 'user-plus'
  | 'users'
  | 'workspace-1'
  | 'workspace-2';

const fileIcon = (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </>
);

const iconShapes: Record<IconName, ReactElement> = {
  alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0" /><path d="M12 9v4M12 17h.01" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  calendar: <><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>,
  check: <path d="m20 6-11 11-5-5" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  clipboard: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4a3 3 0 0 1 6 0v2H9ZM9 12h6M9 16h4" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  dots: <><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  'file-pdf': fileIcon,
  'file-ppt': fileIcon,
  'file-search': <>{fileIcon}<circle cx="10" cy="13" r="2.5" /><path d="m12 15 2 2" /></>,
  'file-text': <>{fileIcon}<path d="M8 13h8M8 17h8M8 9h2" /></>,
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  'folder-active': <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  'log-out': <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  'mic-white': <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  report: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 0 1-4 0v-.06A1.8 1.8 0 0 0 8.7 19.3a1.8 1.8 0 0 0-2 .36l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.6 13H2.5a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.64-1.1 1.8 1.8 0 0 0-.36-2l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04a1.8 1.8 0 0 0 2 .36H8.7A1.8 1.8 0 0 0 9.8 1.8V1.7a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1.1 1.64 1.8 1.8 0 0 0 2-.36l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04a1.8 1.8 0 0 0-.36 2V8a1.8 1.8 0 0 0 1.64 1.1h.1a2 2 0 0 1 0 4h-.1A1.8 1.8 0 0 0 19.4 15" /></>,
  sparkles: <><path d="m12 3 1.5 5L19 10l-5.5 2L12 17l-1.5-5L5 10l5.5-2Z" /><path d="m19 3 .5 2L22 6l-2.5 1L19 9l-.5-2L16 6l2.5-1ZM5 15l.5 2L8 18l-2.5 1L5 21l-.5-2L2 18l2.5-1Z" /></>,
  star: <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z" />,
  'status-1': <path d="M12 3v18M3 12h18" />,
  'status-2': <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
  'status-3': <path d="m20 6-11 11-5-5" />,
  'status-4': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  'status-5': <path d="M5 12h14" />,
  'triangle-down': <path d="m5 8 7 8 7-8Z" fill="currentColor" stroke="none" />,
  'triangle-right': <path d="m8 5 8 7-8 7Z" fill="currentColor" stroke="none" />,
  upload: <><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></>,
  'user-plus': <><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  'workspace-1': <path d="M4 20V6l8-3 8 3v14M9 20v-5h6v5M8 9h1M15 9h1" />,
  'workspace-2': <path d="M4 20V6l8-3 8 3v14M9 20v-5h6v5M8 9h1M15 9h1" />,
};

const getIconName = (src: string) =>
  src.split('/').at(-1)?.replace(/\.(png|svg)$/, '') as IconName | undefined;

export const AppIcon = ({ src, alt, ...props }: AppIconProps) => {
  const shape = iconShapes[getIconName(src) ?? 'file-text'] ?? fileIcon;

  return (
    <svg
      aria-hidden={alt === ''}
      aria-label={alt || undefined}
      fill="none"
      role={alt ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      {shape}
    </svg>
  );
};
