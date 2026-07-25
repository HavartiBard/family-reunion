FROM python:3.12-slim

# supercronic for cron scheduling inside the container
ARG SUPERCRONIC_VERSION=0.2.29
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates && \
    wget -q "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
         -O /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic && \
    apt-get purge -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Default: run batch mode on cron schedule.
# Override CMD to run one-off: docker run ... python agent.py --person <id>
CMD ["sh", "-c", \
     "echo \"${CRON_SCHEDULE:-0 2 * * *} cd /app && python agent.py --batch >> /proc/1/fd/1 2>&1\" \
      > /tmp/crontab && supercronic /tmp/crontab"]
