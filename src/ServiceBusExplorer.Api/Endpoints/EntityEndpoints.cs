using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.Api.Endpoints;

public static class EntityEndpoints
{
    public static IEndpointRouteBuilder MapEntityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/connections/{connectionId}").WithTags("Entities");

        group.MapGet("/overview", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var overview = await explorer.GetNamespaceOverviewAsync(connectionId, ct);
            return Results.Ok(overview);
        });

        group.MapGet("/queues", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var queues = await explorer.GetQueuesAsync(connectionId, ct);
            return Results.Ok(queues);
        });

        group.MapGet("/topics", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var topics = await explorer.GetTopicsAsync(connectionId, ct);
            return Results.Ok(topics);
        });

        group.MapGet("/queues/{queueName}/counts", async (string connectionId, string queueName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var counts = await explorer.GetEntityCountsAsync(connectionId, EntityPath.ForQueue(queueName), ct);
            return Results.Ok(counts);
        });

        group.MapGet("/topics/{topicName}/subscriptions/{subscriptionName}/counts", async (string connectionId, string topicName, string subscriptionName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var counts = await explorer.GetEntityCountsAsync(connectionId, EntityPath.ForSubscription(topicName, subscriptionName), ct);
            return Results.Ok(counts);
        });

        return app;
    }
}
