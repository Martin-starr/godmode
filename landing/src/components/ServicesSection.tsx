import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const services = [
  {
    tag: "Direction",
    title: "Brand & Direction",
    description:
      "We find the core feeling of a brand and build a world around it — voice, colour, motion and story, all moving as one.",
    video:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3F7VRh1v22Oprb61Ysc9ZVbmxWM/hf_20260724_005324_ecb6d9d9-13ce-4144-9376-3698454f2d1c.mp4",
  },
  {
    tag: "Motion",
    title: "Motion & Immersion",
    description:
      "From first frame to final render, we craft immersive visuals and interfaces that feel alive — smooth, tactile, and just a little hypnotic.",
    video:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3F7VRh1v22Oprb61Ysc9ZVbmxWM/hf_20260724_005326_74d929cd-82a1-43c7-997a-80dbf1719c71.mp4",
  },
];

const ServicesSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="work"
      className="relative overflow-hidden bg-black px-6 py-28 md:py-40"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)]" />

      <div ref={ref} className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="mb-12 flex items-center justify-between md:mb-16"
        >
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white md:text-5xl">
            What we do
          </h2>
          <span className="hidden text-sm text-white/40 md:block">Services</span>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: i * 0.15 }}
              className="liquid-glass group overflow-hidden rounded-3xl"
            >
              <div className="relative aspect-video overflow-hidden">
                <video
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src={service.video}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>

              <div className="p-6 md:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-white/40">
                    {service.tag}
                  </span>
                  <span className="liquid-glass rounded-full p-2 text-white">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <h3 className="mb-3 font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
                  {service.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50">
                  {service.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
