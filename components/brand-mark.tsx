interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="url(#brand-bg)" height="64" rx="18" width="64" />
      <path
        d="M16 40.5C20.2 34.6 27.1 30.75 34.9 30.75C42.5 30.75 49.25 34.42 53.5 40.06"
        stroke="#DDF6E5"
        strokeLinecap="round"
        strokeWidth="3.2"
      />
      <path
        d="M32.2 13C24.72 16.08 20.2 22.74 20.2 30.48C20.2 31.88 20.35 33.24 20.66 34.55"
        stroke="#F8F1A2"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
      <path
        d="M32.25 13C39.05 15.8 43.5 21.32 44.1 28.08"
        stroke="#FFF4B7"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
      <path
        d="M28 44.5C24 40.58 24.66 32.94 29.48 27.43C34.3 21.93 41.44 20.61 45.44 24.53C49.44 28.45 48.78 36.09 43.96 41.59C39.14 47.1 32 48.42 28 44.5Z"
        fill="url(#leaf-fill)"
      />
      <path
        d="M29.5 43.28C33.5 37.3 37.86 32.65 42.8 28.64"
        stroke="#0F5C4A"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="M22 47.8C28.15 51.4 35.66 52.16 42.66 49.9"
        stroke="#9B5D34"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
      <circle cx="18.8" cy="17.8" fill="#F7D15B" r="3.6" />
      <defs>
        <linearGradient id="brand-bg" x1="9" x2="59" y1="6" y2="59">
          <stop offset="0" stopColor="#1E7C5D" />
          <stop offset="0.52" stopColor="#4CA071" />
          <stop offset="1" stopColor="#87C5A8" />
        </linearGradient>
        <linearGradient id="leaf-fill" x1="28" x2="46.2" y1="23" y2="46.2">
          <stop offset="0" stopColor="#A9E08E" />
          <stop offset="1" stopColor="#5BBF7A" />
        </linearGradient>
      </defs>
    </svg>
  );
}
