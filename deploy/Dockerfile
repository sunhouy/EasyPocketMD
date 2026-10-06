# All downloads/builds happen in GitHub Actions, never on the deployment server.
FROM docker:28-cli AS docker-client
FROM node:24-bookworm-slim AS app
ENV NODE_ENV=production QT_QPA_PLATFORM=offscreen MARKITDOWN_PYTHON=/opt/python/bin/python
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    pandoc wkhtmltopdf fonts-noto-cjk fonts-liberation ca-certificates curl libgomp1 libxml2 libtinfo6 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/python && /opt/python/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=docker-client /usr/local/bin/docker /usr/local/bin/docker
COPY api ./api
COPY shared ./shared
COPY scripts ./scripts
COPY reference-docs ./reference-docs
COPY dist ./dist
RUN /opt/python/bin/python scripts/create-reference-docx.py
EXPOSE 3150
CMD ["./node_modules/.bin/tsx", "api/server.ts"]

FROM python:3.12-slim AS print
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY deploy/print-requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY print/print_server.py ./print_server.py
ENTRYPOINT ["python", "print_server.py", "--host", "127.0.0.1"]

FROM nginx:1.28-alpine AS gateway
COPY deploy/nginx-container.conf /etc/nginx/templates/default.conf.template

# The regional edge serves the exact same frontend without a second database/API.
COPY deploy/nginx-edge.conf /etc/nginx/templates/default.conf.edge
COPY dist /usr/share/nginx/html
COPY shared /usr/share/nginx/html/shared
RUN apk add --no-cache ca-certificates curl
