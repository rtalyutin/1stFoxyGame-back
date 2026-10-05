ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /app
COPY ops/artifacts.mjs ops/supervisor.mjs ops/cli.mjs ops/migrate-release.mjs ./ops/
COPY launcher/ ./launcher/
USER 10001:10001
ENV NODE_ENV=production GATEWAY_PORT=4100 API_PORT_A=4101 API_PORT_B=4102 RELEASES_DIR=/releases STATE_DIR=/state LAUNCHER_DIR=/app/launcher
EXPOSE 4100
CMD ["node", "ops/supervisor.mjs"]
