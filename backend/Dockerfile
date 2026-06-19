FROM ghcr.io/muchobien/pocketbase:0.22.20 AS pocketbase

FROM alpine:3.19
RUN apk add --no-cache caddy ca-certificates python3

COPY --from=pocketbase /usr/local/bin/pocketbase /usr/local/bin/pocketbase
COPY apple_bridge.py /apple_bridge.py
COPY pb_migrations /pb_migrations
COPY Caddyfile /etc/caddy/Caddyfile
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8090
CMD ["/start.sh"]
