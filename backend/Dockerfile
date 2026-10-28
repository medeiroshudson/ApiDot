# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS base
WORKDIR /src

# Copy solution and project files for optimal layer caching
COPY ApiDot.sln ./
COPY Directory.Build.props* ./
COPY src/ApiDot.Core/ApiDot.Core.csproj src/ApiDot.Core/
COPY src/ApiDot.Server/ApiDot.Server.csproj src/ApiDot.Server/
COPY src/ApiDot.Agent/ApiDot.Agent.csproj src/ApiDot.Agent/

RUN dotnet restore src/ApiDot.Server/ApiDot.Server.csproj

FROM base AS dev
WORKDIR /src
COPY src/ src/

ENV ASPNETCORE_ENVIRONMENT=Development \
    DOTNET_USE_POLLING_FILE_WATCHER=1 \
    DOTNET_WATCH_RESTART_ON_RUDE_EDIT=1

EXPOSE 5000
ENTRYPOINT ["dotnet", "watch", "run", "--project", "src/ApiDot.Server/ApiDot.Server.csproj", "--urls", "http://0.0.0.0:5000", "--non-interactive"]

FROM base AS build

# Copy source files
COPY src/ src/

# Build and publish ApiDot.Server
RUN dotnet publish src/ApiDot.Server/ApiDot.Server.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Non-root user for security
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin apidot && \
    mkdir -p /app/data && \
    chown -R apidot:apidot /app
COPY --from=build --chown=apidot:apidot /app/publish/ ./
RUN chown -R apidot:apidot /app

ENV ASPNETCORE_URLS=http://+:5000 \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

ARG APIDOT_VERSION=dev
ENV APIDOT_VERSION=$APIDOT_VERSION

USER apidot
EXPOSE 5000
ENTRYPOINT ["dotnet", "ApiDot.Server.dll"]
