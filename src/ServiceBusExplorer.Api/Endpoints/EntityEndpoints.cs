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

        group.MapPost("/queues", async (string connectionId, CreateQueueRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "Queue name is required." });
            }
            var queue = await explorer.CreateQueueAsync(connectionId, request, ct);
            return Results.Created($"/api/connections/{connectionId}/queues/{queue.Name}", queue);
        });

        group.MapDelete("/queues/{queueName}", async (string connectionId, string queueName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var deleted = await explorer.DeleteQueueAsync(connectionId, queueName, ct);
            return deleted ? Results.Ok(new { message = $"Queue '{queueName}' deleted." }) : Results.NotFound();
        });

        group.MapGet("/topics", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var topics = await explorer.GetTopicsAsync(connectionId, ct);
            return Results.Ok(topics);
        });

        group.MapPost("/topics", async (string connectionId, CreateTopicRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "Topic name is required." });
            }
            var topic = await explorer.CreateTopicAsync(connectionId, request, ct);
            return Results.Created($"/api/connections/{connectionId}/topics/{topic.Name}", topic);
        });

        group.MapDelete("/topics/{topicName}", async (string connectionId, string topicName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var deleted = await explorer.DeleteTopicAsync(connectionId, topicName, ct);
            return deleted ? Results.Ok(new { message = $"Topic '{topicName}' deleted." }) : Results.NotFound();
        });

        group.MapPost("/topics/{topicName}/subscriptions", async (string connectionId, string topicName, CreateSubscriptionRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.SubscriptionName))
            {
                return Results.BadRequest(new { error = "Subscription name is required." });
            }
            var sub = await explorer.CreateSubscriptionAsync(connectionId, topicName, request, ct);
            return Results.Created($"/api/connections/{connectionId}/topics/{topicName}/subscriptions/{sub.SubscriptionName}", sub);
        });

        group.MapDelete("/topics/{topicName}/subscriptions/{subscriptionName}", async (string connectionId, string topicName, string subscriptionName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var deleted = await explorer.DeleteSubscriptionAsync(connectionId, topicName, subscriptionName, ct);
            return deleted ? Results.Ok(new { message = $"Subscription '{subscriptionName}' deleted." }) : Results.NotFound();
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
