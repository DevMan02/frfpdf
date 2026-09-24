/** Small inline stroke icons: no icon font, nothing fetched at runtime. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fitWidth: 'M4 5v14M20 5v14M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  open: 'M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  device: 'M5 5h14v10H5zM9 19h6M12 15v4',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  pen: 'M4 20c3 0 4-2 6-5l7-7a2 2 0 0 0-3-3l-7 7c-3 2-5 3-5 6M14 6l3 3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
