# PassDesk client — multi-stage production Dockerfile.
# Replaces the previous dev-server setup (vite preview in runtime) with:
#   - Stage 1: node builds static dist/ bundle once at image build time
#   - Stage 2: nginx serves dist/ + reverse-proxies /api/* to backend
#
# Benefits:
#   - No npm ci / network access at container start (immutable image)
#   - Proper static server (gzip, cache-control, security headers)
#   - Predictable cold start (seconds vs minutes)

# ============================================================
# Stage 1: builder
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first for better Docker layer cache.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build-time Vite environment variables.
# Vite inlines these into the bundle — values must be supplied at image build.
# In docker-compose use:
#   build:
#     context: ./client
#     args:
#       VITE_MOBILE_ACCESS_ENABLED: "false"
ARG VITE_MOBILE_ACCESS_ENABLED="false"
ARG VITE_ENABLE_DEBUG_ROUTES="false"
ARG VITE_CLIENT_URL=""
ARG VITE_SERVER_URL=""

ENV VITE_MOBILE_ACCESS_ENABLED=${VITE_MOBILE_ACCESS_ENABLED}
ENV VITE_ENABLE_DEBUG_ROUTES=${VITE_ENABLE_DEBUG_ROUTES}
ENV VITE_CLIENT_URL=${VITE_CLIENT_URL}
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

COPY . .

RUN npm run build

# ============================================================
# Stage 2: runtime (nginx)
# ============================================================
FROM nginx:1.27-alpine

# Replace default site config with our SPA-aware one
# (gzip, API proxy, SPA fallback, security headers).
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder stage.
COPY --from=builder /app/dist /usr/share/nginx/html

# Listens on 5173 (see nginx.conf) to preserve existing docker-compose
# port mapping "5173:5173" and upstream reverse-proxy config.
EXPOSE 5173

# Nginx runs in foreground so container stays up.
CMD ["nginx", "-g", "daemon off;"]
