FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_FORMS_PUBLIC_HOST=""
ENV NEXT_PUBLIC_FORMS_PUBLIC_HOST=$NEXT_PUBLIC_FORMS_PUBLIC_HOST
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FORMS_DATA_DIR=/data
COPY --from=build /app /app
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
