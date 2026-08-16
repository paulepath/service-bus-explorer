using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.Api.Endpoints;

public static class MessageEndpoints
{
    public static IEndpointRouteBuilder MapMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/connections/{connectionId}").WithTags("Messages");

        // Queue message operations
        group.MapGet("/queues/{queueName}/messages", async (
            string connectionId,
            string queueName,
            SubQueueType subQueue = SubQueueType.None,
            int count = 50,
            long? fromSeq = null,
            IMessageOperationsService messageOps = null!,
            CancellationToken ct = default) =>
        {
            try
            {
                var entityPath = EntityPath.ForQueue(queueName);
                var messages = await messageOps.PeekMessagesAsync(connectionId, entityPath, subQueue, count, fromSeq, ct);
                return Results.Ok(messages);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/queues/{queueName}/messages/send", async (
            string connectionId,
            string queueName,
            SendMessageRequest request,
            IMessageOperationsService messageOps,
            CancellationToken ct) =>
        {
            try
            {
                var entityPath = EntityPath.ForQueue(queueName);
                var result = await messageOps.SendMessageAsync(connectionId, entityPath, request, ct);
                return result.Success ? Results.Ok(result) : Results.BadRequest(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/queues/{queueName}/deadletters/resend", async (
            string connectionId,
            string queueName,
            ResendDeadLetterRequest request,
            IMessageOperationsService messageOps,
            CancellationToken ct) =>
        {
            try
            {
                var entityPath = EntityPath.ForQueue(queueName);
                var result = await messageOps.ResendDeadLetterAsync(connectionId, entityPath, request, ct);
                return result.Success ? Results.Ok(result) : Results.BadRequest(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapDelete("/queues/{queueName}/messages/scheduled/{seq:long}", async (
            string connectionId,
            string queueName,
            long seq,
            IMessageOperationsService messageOps,
            CancellationToken ct) =>
        {
            try
            {
                var entityPath = EntityPath.ForQueue(queueName);
                var success = await messageOps.CancelScheduledMessageAsync(connectionId, entityPath, seq, ct);
                return success ? Results.NoContent() : Results.BadRequest();
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/queues/{queueName}/purge", async (
            string connectionId,
            string queueName,
            SubQueueType subQueue = SubQueueType.None,
            int maxCount = 1000,
            IMessageOperationsService messageOps = null!,
            CancellationToken ct = default) =>
        {
            try
            {
                var entityPath = EntityPath.ForQueue(queueName);
                var purged = await messageOps.PurgeMessagesAsync(connectionId, entityPath, subQueue, maxCount, ct);
                return Results.Ok(new { PurgedCount = purged });
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        // Topic / Subscription message operations
        group.MapPost("/topics/{topicName}/messages/send", async (
            string connectionId,
            string topicName,
            SendMessageRequest request,
            IMessageOperationsService messageOps,
            CancellationToken ct) =>
        {
            try
            {
                var entityPath = EntityPath.ForTopic(topicName);
                var result = await messageOps.SendMessageAsync(connectionId, entityPath, request, ct);
                return result.Success ? Results.Ok(result) : Results.BadRequest(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapGet("/topics/{topicName}/subscriptions/{subscriptionName}/messages", async (
            string connectionId,
            string topicName,
            string subscriptionName,
            SubQueueType subQueue = SubQueueType.None,
            int count = 50,
            long? fromSeq = null,
            IMessageOperationsService messageOps = null!,
            CancellationToken ct = default) =>
        {
            try
            {
                var entityPath = EntityPath.ForSubscription(topicName, subscriptionName);
                var messages = await messageOps.PeekMessagesAsync(connectionId, entityPath, subQueue, count, fromSeq, ct);
                return Results.Ok(messages);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/topics/{topicName}/subscriptions/{subscriptionName}/deadletters/resend", async (
            string connectionId,
            string topicName,
            string subscriptionName,
            ResendDeadLetterRequest request,
            IMessageOperationsService messageOps,
            CancellationToken ct) =>
        {
            try
            {
                var entityPath = EntityPath.ForSubscription(topicName, subscriptionName);
                var result = await messageOps.ResendDeadLetterAsync(connectionId, entityPath, request, ct);
                return result.Success ? Results.Ok(result) : Results.BadRequest(result);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        group.MapPost("/topics/{topicName}/subscriptions/{subscriptionName}/purge", async (
            string connectionId,
            string topicName,
            string subscriptionName,
            SubQueueType subQueue = SubQueueType.None,
            int maxCount = 1000,
            IMessageOperationsService messageOps = null!,
            CancellationToken ct = default) =>
        {
            try
            {
                var entityPath = EntityPath.ForSubscription(topicName, subscriptionName);
                var purged = await messageOps.PurgeMessagesAsync(connectionId, entityPath, subQueue, maxCount, ct);
                return Results.Ok(new { PurgedCount = purged });
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { error = ex.Message });
            }
        });

        return app;
    }
}
