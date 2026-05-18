FROM mcr.microsoft.com/playwright:v1.52.0-jammy

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium

COPY . .
EXPOSE 3000
CMD ["node", "index.js"]