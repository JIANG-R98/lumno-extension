export interface RemixIconProps {
  className?: string;
  fallback?: string;
}

export function RemixIcon({
  className = '',
  fallback = 'ri-link'
}: RemixIconProps) {
  return (
    <i
      aria-hidden="true"
      className={`ri-icon ${className || fallback}`}
    />
  );
}
