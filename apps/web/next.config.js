const path = require('path');

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'standalone',
  // Monorepo: trace dependencies from the workspace root (hoisted node_modules).
  experimental: { outputFileTracingRoot: path.join(__dirname, '../../') },
};
