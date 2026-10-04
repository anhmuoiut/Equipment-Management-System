/** @type {import('next').NextConfig} */
const nextConfig = {
  // Portability: 'standalone' cho phép build thành container bất cứ lúc nào: rời Vercel
  // = viết một Dockerfile + đổi env, không phải viết lại kiến trúc.
  output: 'standalone',
  reactStrictMode: true,
  eslint: { dirs: ['app', 'lib', 'components', 'scripts'] },
};
export default nextConfig;
