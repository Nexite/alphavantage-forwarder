FROM node:20-alpine
RUN apk add --no-cache openssl curl 

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .


# RUN npm run prisma:migrate
RUN npm run prisma:generate

RUN npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npm run prisma:deploy && npm run start"]
