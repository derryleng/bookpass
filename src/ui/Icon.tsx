import { iconFor } from './icons';

interface Props {
  /** Icon key such as fa-solid:folder. */
  name: string;
  className?: string;
  spin?: boolean;
}

/** Draws a Font Awesome Free icon from its path data, so no icon font or extra package is needed. */
export function Icon({ name, className = '', spin }: Props) {
  const [width, height, , , path] = iconFor(name).icon;
  return (
    <svg
      className={`icon ${spin ? 'spin' : ''} ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={String(path)} />
    </svg>
  );
}

/** Shorthand for the many interface icons, which are all solid. */
export const I = ({ n, ...rest }: { n: string; className?: string; spin?: boolean }) => (
  <Icon name={`fa-solid:${n}`} {...rest} />
);
