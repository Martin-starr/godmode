import { ArrowRight } from 'lucide-react';
import BrandMarquee from './BrandMarquee';

const HERO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4';

export default function HeroSection() {
  return (
    <div className="flex-1 px-6 pt-20 pb-6 flex items-end">
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ height: 'calc(100vh - 96px)' }}
      >
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src={HERO_VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
        />

        <div className="relative z-10 flex flex-col items-start justify-start h-full p-12 pt-36">
          <h1
            className="text-black text-5xl md:text-6xl font-medium leading-tight max-w-xl mb-4"
            style={{ letterSpacing: '-0.04em' }}
          >
            Your Wealth
            <br />
            Works
          </h1>
          <p
            className="text-black/70 text-base md:text-lg max-w-md mb-8 leading-relaxed"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            An automated, reward-powered digital dollar built for native
            passive earnings and effortless connection into DeFi.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-3 bg-black text-white text-base md:text-lg font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200"
          >
            Join us
            <span className="bg-white rounded-full p-2">
              <ArrowRight className="w-5 h-5 text-black" />
            </span>
          </button>

          <BrandMarquee />
        </div>
      </div>
    </div>
  );
}
