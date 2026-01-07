interface SparkleIconProps {
  className?: string;
}

export function SparkleIcon({ className }: SparkleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0afecf" />
          <stop offset="100%" stopColor="#16bbd4" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="url(#sparkle-gradient)"
      />
      <path
        d="M19 15L19.5 17L21.5 17.5L19.5 18L19 20L18.5 18L16.5 17.5L18.5 17L19 15Z"
        fill="url(#sparkle-gradient)"
      />
      <path
        d="M7 3L7.3 4.2L8.5 4.5L7.3 4.8L7 6L6.7 4.8L5.5 4.5L6.7 4.2L7 3Z"
        fill="url(#sparkle-gradient)"
      />
    </svg>
  );
}
