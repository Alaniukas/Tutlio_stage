FROM node:20-bookworm-slim

# LibreOffice + fonts matching school Word templates. Without real Times New
# Roman (or a metric-compatible substitute) LibreOffice falls back to DejaVu
# Serif, which reflows the text and changes line breaks and page count.
# ttf-mscorefonts-installer (Debian contrib) downloads the genuine MS core
# fonts (Times New Roman, Arial, ...); if that download ever fails at build
# time, fonts-liberation (metric-compatible with TNR/Arial) and the crosextra
# fonts (Calibri/Cambria equivalents) still preserve the Word layout.
RUN sed -i 's/Components: main/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
  && apt-get install -y --no-install-recommends \
    libreoffice \
    fontconfig \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
  && (apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
    || echo "WARN: mscorefonts install failed; Liberation fallback stays in use") \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
