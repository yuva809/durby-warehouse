# Durby Warehouse frontend — static build served by nginx.
#
# NOTE (see deployment README "Known limitations"): this still ships the V1
# build, which talks to Zustand + localStorage, not the API in this same
# compose stack. The container/proxy wiring is real and works today; the
# frontend code itself has not yet been rewired to call the backend — that
# is the next increment, not done in this pass.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
