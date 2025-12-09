FROM oven/bun:alpine

RUN apk --no-cache add dbus

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["dbus-run-session", "--", "bun", "test"]
