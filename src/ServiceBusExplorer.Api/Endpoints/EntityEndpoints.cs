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
            try
            {
                var overview = await explorer.GetNamespaceOverviewAsync(connectionId, ct);
                return Results.Ok(overview);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapGet("/queues", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            try
            {
                var queues = await explorer.GetQueuesAsync(connectionId, ct);
                return Results.Ok(queues);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/queues", async (string connectionId, CreateQueueRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "Queue name is required." });
            }
            if (request.Name.Contains('\\'))
            {
                return Results.BadRequest(new { error = @"Queue names cannot contain '\'. Use '/' for hierarchical paths instead (e.g. orders/uk/invoices)." });
            }
            try
            {
                var queue = await explorer.CreateQueueAsync(connectionId, request, ct);
                return Results.Created($"/api/connections/{connectionId}/queues/{queue.Name}", queue);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapDelete("/queues/{queueName}", async (string connectionId, string queueName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var decodedQueue = Uri.UnescapeDataString(queueName);
            try
            {
                var deleted = await explorer.DeleteQueueAsync(connectionId, decodedQueue, ct);
                return deleted ? Results.Ok(new { message = $"Queue '{decodedQueue}' deleted." }) : Results.NotFound();
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapGet("/topics", async (string connectionId, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            try
            {
                var topics = await explorer.GetTopicsAsync(connectionId, ct);
                return Results.Ok(topics);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/topics", async (string connectionId, CreateTopicRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "Topic name is required." });
            }
            if (request.Name.Contains('\\'))
            {
                return Results.BadRequest(new { error = @"Topic names cannot contain '\'. Use '/' for hierarchical paths instead (e.g. events/uk/orders)." });
            }
            try
            {
                var topic = await explorer.CreateTopicAsync(connectionId, request, ct);
                return Results.Created($"/api/connections/{connectionId}/topics/{topic.Name}", topic);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapDelete("/topics/{topicName}", async (string connectionId, string topicName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var decodedTopic = Uri.UnescapeDataString(topicName);
            try
            {
                var deleted = await explorer.DeleteTopicAsync(connectionId, decodedTopic, ct);
                return deleted ? Results.Ok(new { message = $"Topic '{decodedTopic}' deleted." }) : Results.NotFound();
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/topics/{topicName}/subscriptions", async (string connectionId, string topicName, CreateSubscriptionRequest request, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.SubscriptionName))
            {
                return Results.BadRequest(new { error = "Subscription name is required." });
            }
            var decodedTopic = Uri.UnescapeDataString(topicName);
            try
            {
                var sub = await explorer.CreateSubscriptionAsync(connectionId, decodedTopic, request, ct);
                return Results.Created($"/api/connections/{connectionId}/topics/{decodedTopic}/subscriptions/{sub.SubscriptionName}", sub);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapDelete("/topics/{topicName}/subscriptions/{subscriptionName}", async (string connectionId, string topicName, string subscriptionName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            var decodedTopic = Uri.UnescapeDataString(topicName);
            var decodedSub = Uri.UnescapeDataString(subscriptionName);
            try
            {
                var deleted = await explorer.DeleteSubscriptionAsync(connectionId, decodedTopic, decodedSub, ct);
                return deleted ? Results.Ok(new { message = $"Subscription '{decodedSub}' deleted." }) : Results.NotFound();
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapGet("/queues/{queueName}/counts", async (string connectionId, string queueName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            try
            {
                var counts = await explorer.GetEntityCountsAsync(connectionId, EntityPath.ForQueue(queueName), ct);
                return Results.Ok(counts);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapGet("/topics/{topicName}/subscriptions/{subscriptionName}/counts", async (string connectionId, string topicName, string subscriptionName, IServiceBusExplorerService explorer, CancellationToken ct) =>
        {
            try
            {
                var counts = await explorer.GetEntityCountsAsync(connectionId, EntityPath.ForSubscription(topicName, subscriptionName), ct);
                return Results.Ok(counts);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        return app;
    }
}
