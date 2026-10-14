const brands: { name: string; style: React.CSSProperties }[] = [
  {
    name: 'Stripe',
    style: {
      fontFamily: 'Georgia, serif',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontSize: '15px',
    },
  },
  {
    name: 'Coinbase',
    style: {
      fontFamily: 'Arial, sans-serif',
      fontWeight: 900,
      letterSpacing: '0.08em',
      fontSize: '13px',
      textTransform: 'uppercase',
    },
  },
  {
    name: 'Uniswap',
    style: {
      fontFamily: '"Trebuchet MS", sans-serif',
      fontWeight: 600,
      letterSpacing: '0.01em',
      fontSize: '15px',
      fontStyle: 'italic',
    },
  },
  {
    name: 'Aave',
    style: {
      fontFamily: '"Courier New", monospace',
      fontWeight: 700,
      letterSpacing: '0.12em',
      fontSize: '13px',
      textTransform: 'uppercase',
    },
  },
  {
    name: 'Compound',
    style: {
      fontFamily: 'Palatino, "Book Antiqua", serif',
      fontWeight: 400,
      letterSpacing: '-0.01em',
      fontSize: '16px',
    },
  },
  {
    name: 'MakerDAO',
    style: {
      fontFamily: 'Impact, "Arial Narrow", sans-serif',
      fontWeight: 400,
      letterSpacing: '0.04em',
      fontSize: '14px',
    },
  },
  {
    name: 'Chainlink',
    style: {
      fontFamily: 'Verdana, sans-serif',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      fontSize: '13px',
    },
  },
];

export default function BrandMarquee() {
  return (
    <div className="mt-24 w-full max-w-md overflow-hidden">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee 22s linear infinite;
        }
      `}</style>
      <div className="marquee-track">
        {[...brands, ...brands].map((brand, i) => (
          <span
            key={`${brand.name}-${i}`}
            className="mx-7 shrink-0 text-black/60 whitespace-nowrap"
            style={brand.style}
          >
            {brand.name}
          </span>
        ))}
      </div>
    </div>
  );
}
