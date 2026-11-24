FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies are kept on purpose: the demo stack runs sequelize-cli migrations at start.
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["node", "src/server.js"]
