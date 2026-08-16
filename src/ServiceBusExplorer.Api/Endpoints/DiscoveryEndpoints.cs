using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServiceBusExplorer.Discovery.Providers;

namespace ServiceBusExplorer.Api.Endpoints;

public static class DiscoveryEndpoints
{
    public static IEndpointRouteBuilder MapDiscoveryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/discovery").WithTags("Discovery");

        group.MapGet("/emulators", async (WslDockerDiscoveryProvider provider, CancellationToken ct) =>
        {
            var emulators = await provider.DiscoverEmulatorsAsync(ct);
            return Results.Ok(emulators);
        });

        return app;
    }
}
