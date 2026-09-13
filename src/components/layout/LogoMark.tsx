export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="durby-logo-stem" x1="20" y1="95" x2="58" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6fd3a5" />
          <stop offset="1" stopColor="#2f8f66" />
        </linearGradient>
      </defs>
      {/* Ring: outer D minus inner D counter, true transparency for the hole */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#0c2b21"
        d="M40,20 H100 A80,80 0 0 1 100,180 H40 A20,20 0 0 1 20,160 V40 A20,20 0 0 1 40,20 Z
           M58,58 H100 A42,42 0 0 1 100,142 H58 Z"
      />
      {/* Gradient highlight on the lower stem */}
      <path fill="url(#durby-logo-stem)" d="M20,100 H58 V180 H40 A20,20 0 0 1 20,160 Z" />
      {/* Two marks inside the counter */}
      <rect x="86" y="78" width="14" height="48" rx="7" fill="#0c2b21" />
      <rect x="108" y="78" width="14" height="48" rx="7" fill="#0c2b21" />
    </svg>
  )
}
