FROM node:10-alpine

WORKDIR /app

VOLUME ["/app/db", "/app/config", "/app/log"]

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 8080

CMD ["npm", "start"]