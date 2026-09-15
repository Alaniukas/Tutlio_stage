FROM node:20-bookworm-slim

# LibreOffice + real Microsoft core fonts (Times New Roman, Arial, ...) so
# school Word templates keep the same line breaks as before.
# Do NOT use ttf-mscorefonts-installer's SourceForge fetch from Railway
# (SE Asia: 403 / multi-minute timeouts per .exe, then fonts missing).
# These are the same original Microsoft "core fonts for the web" installers,
# mirrored on GitHub; cabextract installs them locally with a short timeout.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer-nogui \
    tini \
    fontconfig \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    cabextract \
    wget \
    ca-certificates \
  && mkdir -p /tmp/msttcorefonts /usr/share/fonts/truetype/msttcorefonts \
  && for f in andale32.exe arial32.exe arialb32.exe comic32.exe courie32.exe \
       georgi32.exe impact32.exe times32.exe trebuc32.exe verdan32.exe webdin32.exe; do \
         wget -q --timeout=20 --tries=3 -O "/tmp/msttcorefonts/$f" \
           "https://raw.githubusercontent.com/pushcx/corefonts/master/$f"; \
       done \
  && for f in /tmp/msttcorefonts/*.exe; do cabextract -q -L -d /usr/share/fonts/truetype/msttcorefonts "$f"; done \
  && fc-cache -f \
  && rm -rf /tmp/msttcorefonts /var/lib/apt/lists/*

COPY fontconfig/99-tutlio-school-contracts.conf /etc/fonts/conf.d/99-tutlio-school-contracts.conf
RUN fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "server.js"]
