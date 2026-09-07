# Build stage: type-check and bundle the SPA.
FROM node:24-alpine AS build
WORKDIR /build

# package files first so `npm ci` is cached until dependencies change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage: nginx serves the static bundle and proxies /api to the
# backend so the SPA and the API share one origin (see frontend/nginx.conf).
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist/ /usr/share/nginx/html/
EXPOSE 80
