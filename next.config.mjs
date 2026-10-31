/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The full dashboard (Brief, Logg, Systemer …) lives in app/gammel. On a
  // computer it is the home page, so it gets a name that is not "old".
  async rewrites() {
    return [{ source: "/oversikt", destination: "/gammel" }];
  },
};

export default nextConfig;
