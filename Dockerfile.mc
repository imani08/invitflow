FROM alpine:3.22

RUN apk add --no-cache ca-certificates curl \
    && curl -fL "https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.linux-amd64.RELEASE.2025-08-13T08-35-41Z" -o /usr/local/bin/mc \
    && echo "01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891  /usr/local/bin/mc" | sha256sum -c - \
    && chmod +x /usr/local/bin/mc

ENTRYPOINT ["mc"]
