import { useEffect, useRef } from "react";
import { Globe, ArrowRight, Instagram, Twitter } from "lucide-react";
import AboutSection from "../components/AboutSection";
import FeaturedVideoSection from "../components/FeaturedVideoSection";
import PhilosophySection from "../components/PhilosophySection";
import ServicesSection from "../components/ServicesSection";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4";

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Vanilla opacity tween via requestAnimationFrame (no CSS transitions).
    const animateOpacity = (from: number, to: number, duration: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        video.style.opacity = String(from + (to - from) * t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const handleCanPlay = () => {
      void video.play().catch(() => {});
      fadingOutRef.current = false;
      animateOpacity(0, 1, 500);
    };

    const handleTimeUpdate = () => {
      if (!video.duration) return;
      const remaining = video.duration - video.currentTime;
      if (remaining <= 0.55 && !fadingOutRef.current) {
        fadingOutRef.current = true;
        const current = parseFloat(video.style.opacity || "1");
        animateOpacity(current, 0, 500);
      }
    };

    const handleEnded = () => {
      video.style.opacity = "0";
      window.setTimeout(() => {
        video.currentTime = 0;
        void video.play().catch(() => {});
        fadingOutRef.current = false;
        animateOpacity(0, 1, 500);
      }, 100);
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="bg-black">
      {/* SECTION 1 — HERO */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-bottom"
          style={{ opacity: 0 }}
          src={HERO_VIDEO}
          muted
          autoPlay
          playsInline
          preload="auto"
        />

        {/* Navbar */}
        <nav className="relative z-20 px-6 py-6">
          <div className="liquid-glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
            <div className="flex items-center">
              <Globe className="text-white" size={24} />
              <span className="ml-2 text-lg font-semibold text-white">Asme</span>
              <div className="ml-8 hidden items-center gap-8 md:flex">
                <a
                  href="#"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Features
                </a>
                <a
                  href="#"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Pricing
                </a>
                <a
                  href="#"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  About
                </a>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-sm font-medium text-white">Sign Up</button>
              <button className="liquid-glass rounded-full px-6 py-2 text-sm font-medium text-white">
                Login
              </button>
            </div>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
          <h1
            className="whitespace-nowrap text-7xl tracking-tight text-white md:text-8xl lg:text-9xl"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Know it <em className="italic">all</em>.
          </h1>

          <form
            className="mt-10 w-full max-w-xl"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="liquid-glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
              />
              <button
                type="submit"
                aria-label="Submit email"
                className="rounded-full bg-white p-3 text-black"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </form>

          <p className="mt-6 max-w-xl px-4 text-sm leading-relaxed text-white">
            Stay updated with the latest news and insights. Subscribe to our
            newsletter today and never miss out on exciting updates.
          </p>

          <button className="liquid-glass mt-8 rounded-full px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/5">
            Manifesto
          </button>
        </div>

        {/* Social icons footer */}
        <div className="relative z-10 flex justify-center gap-4 pb-12">
          <button
            aria-label="Instagram"
            className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
          >
            <Instagram size={20} />
          </button>
          <button
            aria-label="Twitter"
            className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
          >
            <Twitter size={20} />
          </button>
          <button
            aria-label="Website"
            className="liquid-glass rounded-full p-4 text-white/80 transition-all hover:bg-white/5 hover:text-white"
          >
            <Globe size={20} />
          </button>
        </div>
      </section>

      <AboutSection />
      <FeaturedVideoSection />
      <PhilosophySection />
      <ServicesSection />
    </div>
  );
};

export default Index;
