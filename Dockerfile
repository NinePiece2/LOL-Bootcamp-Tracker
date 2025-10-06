FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Syncfusion License Activation
ARG SYNCFUSION_LICENSE
ENV SYNCFUSION_LICENSE=${SYNCFUSION_LICENSE}
RUN npx syncfusion-license activate
RUN export SYNCFUSION_LICENSE=""

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

# Generate Prisma client before build
RUN npx prisma generate

RUN npm run build
RUN npm prune --omit=dev 

FROM node:22-alpine AS deploy

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/workers.ts ./workers.ts
COPY --from=build /app/src ./src

# Install tsx for running TypeScript files
RUN npm install -g tsx

EXPOSE 3000
CMD ["npm", "start"]