import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const FEATURED_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3F7VRh1v22Oprb61Ysc9ZVbmxWM/hf_20260724_005337_b6b05942-7c84-439a-baa7-6b3cf9f3f59e.mp4";

const FeaturedVideoSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="overflow-hidden bg-black px-6 pb-20 pt-6 md:pb-32 md:pt-10">
      <div ref={ref} className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9 }}
          className="relative aspect-video overflow-hidden rounded-3xl"
        >
          <video
            className="h-full w-full object-cover"
            src={FEATURED_VIDEO}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
            <div className="liquid-glass max-w-md rounded-2xl p-6 md:p-8">
              <p className="mb-3 text-xs uppercase tracking-widest text-white/50">
                The Method
              </p>
              <p className="text-sm leading-relaxed text-white md:text-base">
                We chase the feeling first. Every project begins as a mood — a
                colour, a texture, a pulse — then we engineer it into something
                real enough to ship.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="liquid-glass flex-shrink-0 rounded-full px-8 py-3 text-sm font-medium text-white"
            >
              See the work
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturedVideoSection;
