import { useEffect, useRef } from "react";
import { Aperture, ArrowRight, Instagram, Twitter, Globe } from "lucide-react";
import AboutSection from "../components/AboutSection";
import FeaturedVideoSection from "../components/FeaturedVideoSection";
import PhilosophySection from "../components/PhilosophySection";
import ServicesSection from "../components/ServicesSection";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3F7VRh1v22Oprb61Ysc9ZVbmxWM/hf_20260724_005319_45592616-fb46-4c2b-949d-d6e8ad1a778d.mp4";

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
      {/* Film-grain overlay across the whole page */}
      <div className="grain" aria-hidden="true" />

      {/* SECTION 1 — HERO */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ opacity: 0 }}
          src={HERO_VIDEO}
          muted
          autoPlay
          playsInline
          preload="auto"
        />
        {/* Legibility wash over the video */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/70" />

        {/* Navbar */}
        <nav className="relative z-20 px-6 py-6">
          <div className="liquid-glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-6 py-3">
            <div className="flex items-center">
              <Aperture className="text-white" size={24} />
              <span className="ml-2 font-display text-lg font-semibold tracking-tight text-white">
                Lucid
              </span>
              <div className="ml-8 hidden items-center gap-8 md:flex">
                <a
                  href="#work"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Work
                </a>
                <a
                  href="#studio"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Studio
                </a>
                <a
                  href="#journal"
                  className="text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Journal
                </a>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="hidden text-sm font-medium text-white sm:block">
                Say hello
              </button>
              <button className="liquid-glass rounded-full px-6 py-2 text-sm font-medium text-white">
                Start a project
              </button>
            </div>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex flex-1 -translate-y-[20%] flex-col items-center justify-center px-6 py-12 text-center">
          <h1 className="whitespace-nowrap font-display text-7xl font-bold tracking-tight text-white md:text-8xl lg:text-9xl">
            Dream in <span className="acid-text">color</span>.
          </h1>

          <form
            className="mt-10 w-full max-w-xl"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="liquid-glass flex items-center gap-3 rounded-full py-2 pl-6 pr-2">
              <input
                type="email"
                placeholder="you@studio.com"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
              />
              <button
                type="submit"
                aria-label="Submit email"
                className="rounded-full bg-white p-3 text-black transition-transform hover:scale-105 active:scale-95"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </form>

          <p className="mt-6 max-w-xl px-4 text-sm leading-relaxed text-white/90">
            A design studio bending light, motion and color into brands you
            can't look away from. Leave your email — we send the occasional
            transmission from the studio.
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
