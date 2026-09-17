# Stage 1: Build Angular SPA
FROM node:22-alpine AS build-web
WORKDIR /app/web
COPY src/ServiceBusExplorer.Web/package*.json ./
RUN npm ci
COPY src/ServiceBusExplorer.Web/ ./
RUN npm run build

# Stage 2: Build & Publish .NET 10 Minimal API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build-api
WORKDIR /app
COPY ServiceBusExplorer.slnx ./
COPY src/ServiceBusExplorer.Core/ src/ServiceBusExplorer.Core/
COPY src/ServiceBusExplorer.AzureServiceBus/ src/ServiceBusExplorer.AzureServiceBus/
COPY src/ServiceBusExplorer.Discovery/ src/ServiceBusExplorer.Discovery/
COPY src/ServiceBusExplorer.Api/ src/ServiceBusExplorer.Api/
RUN dotnet restore src/ServiceBusExplorer.Api/ServiceBusExplorer.Api.csproj
RUN dotnet publish src/ServiceBusExplorer.Api/ServiceBusExplorer.Api.csproj -c Release -o /out

# Stage 3: Runtime Image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=build-api /out ./
COPY --from=build-web /app/web/dist/ServiceBusExplorer.Web/browser ./wwwroot

ENV ASPNETCORE_URLS=http://+:8090
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8090

ENTRYPOINT ["dotnet", "ServiceBusExplorer.Api.dll"]
