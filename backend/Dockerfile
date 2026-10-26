# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy solution and project files for optimal layer caching
COPY ApiDot.sln ./
COPY Directory.Build.props* ./
COPY src/ApiDot.Core/ApiDot.Core.csproj src/ApiDot.Core/
COPY src/ApiDot.Server/ApiDot.Server.csproj src/ApiDot.Server/
COPY src/ApiDot.Agent/ApiDot.Agent.csproj src/ApiDot.Agent/

RUN dotnet restore src/ApiDot.Server/ApiDot.Server.csproj

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

USER apidot
EXPOSE 5000
ENTRYPOINT ["dotnet", "ApiDot.Server.dll"]
