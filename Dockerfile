FROM oven/bun:debian

RUN apt-get update && apt-get install -y --no-install-recommends dbus && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["dbus-run-session", "--", "bun", "test"]
