# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_VENICE_BASE_URL can be passed at build time via --build-arg
ARG VITE_VENICE_BASE_URL=
ENV VITE_VENICE_BASE_URL=$VITE_VENICE_BASE_URL
RUN npm run build

# --- Runtime stage: tiny static server ---
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA fallback — every unknown path serves index.html
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  gzip on; gzip_types text/plain application/javascript text/css application/json image/svg+xml;' \
  '  location / { try_files $uri $uri/ /index.html; }' \
  '  location ~* \.(?:js|css|svg|woff2?)$ { expires 1y; add_header Cache-Control "public, immutable"; }' \
  '}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
