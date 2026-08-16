using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.Api.Endpoints;

public static class ConnectionEndpoints
{
    public static IEndpointRouteBuilder MapConnectionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/connections").WithTags("Connections");

        group.MapGet("/", async (IConnectionManager manager, CancellationToken ct) =>
        {
            var connections = await manager.GetAllConnectionsAsync(ct);
            return Results.Ok(connections);
        });

        group.MapGet("/{id}", async (string id, IConnectionManager manager, CancellationToken ct) =>
        {
            var connection = await manager.GetConnectionAsync(id, ct);
            return connection is not null ? Results.Ok(connection) : Results.NotFound();
        });

        group.MapPost("/", async (CreateConnectionRequest request, IConnectionManager manager, CancellationToken ct) =>
        {
            var profile = new ConnectionProfile(
                Id: string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString("N") : request.Id,
                Name: request.Name,
                Type: request.Type,
                ConnectionString: request.ConnectionString,
                FullyQualifiedNamespace: request.FullyQualifiedNamespace,
                IsDiscovered: false,
                Capabilities: ServiceBusCapabilities.None
            );

            var created = await manager.AddConnectionAsync(profile, ct);
            return Results.Created($"/api/connections/{created.Id}", created);
        });

        group.MapPost("/discover", async (IDiscoveryProvider discovery, IConnectionManager manager, CancellationToken ct) =>
        {
            var discovered = await discovery.DiscoverAsync(ct);
            await manager.RegisterDiscoveredConnectionsAsync(discovered, ct);
            var all = await manager.GetAllConnectionsAsync(ct);
            return Results.Ok(all);
        });

        group.MapDelete("/{id}", async (string id, IConnectionManager manager, CancellationToken ct) =>
        {
            bool removed = await manager.RemoveConnectionAsync(id, ct);
            return removed ? Results.NoContent() : Results.NotFound();
        });

        return app;
    }
}

public sealed record CreateConnectionRequest(
    string? Id,
    string Name,
    ConnectionType Type,
    string? ConnectionString,
    string? FullyQualifiedNamespace
);
