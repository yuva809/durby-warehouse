# Durby Warehouse frontend — static build served by nginx.
#
# VITE_API_URL is baked into the JS bundle at BUILD time (Vite convention —
# it cannot be changed by just restarting the container, only by rebuilding
# the image with a different build arg). docker-compose.yml passes it in.

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://api.localhost/api
ARG VITE_SEED_DEMO_PASSWORD=ChangeMe123!
ARG VITE_SHOW_DEMO_LOGINS=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SEED_DEMO_PASSWORD=$VITE_SEED_DEMO_PASSWORD
ENV VITE_SHOW_DEMO_LOGINS=$VITE_SHOW_DEMO_LOGINS
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
