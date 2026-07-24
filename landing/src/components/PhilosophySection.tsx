import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const PHILOSOPHY_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3F7VRh1v22Oprb61Ysc9ZVbmxWM/hf_20260724_005322_0bc5242b-2deb-4ff3-aecc-219a0749b3d4.mp4";

const PhilosophySection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="overflow-hidden bg-black px-6 py-28 md:py-40">
      <div ref={ref} className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 font-display text-5xl font-semibold tracking-tight text-white md:mb-24 md:text-7xl lg:text-8xl"
        >
          Chaos <span className="acid-text">×</span> Control
        </motion.h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="aspect-[4/3] overflow-hidden rounded-3xl"
          >
            <video
              className="h-full w-full object-cover"
              src={PHILOSOPHY_VIDEO}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col justify-center"
          >
            <div>
              <p className="mb-4 text-xs uppercase tracking-widest text-white/40">
                The tension
              </p>
              <p className="text-base leading-relaxed text-white/70 md:text-lg">
                Every breakthrough lives on the edge between a wild idea and
                disciplined craft. We work right on that line — turning the
                strange, the psychedelic and the beautiful into things that
                actually function.
              </p>
            </div>

            <div className="my-8 h-px w-full bg-white/10" />

            <div>
              <p className="mb-4 text-xs uppercase tracking-widest text-white/40">
                The payoff
              </p>
              <p className="text-base leading-relaxed text-white/70 md:text-lg">
                The best work feels inevitable and impossible at once. Our
                process hunts for those moments — the ones that make someone
                stop, stare, and remember exactly how it felt.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PhilosophySection;
