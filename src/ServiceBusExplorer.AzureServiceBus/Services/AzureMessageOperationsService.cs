using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Logging;
using ServiceBusExplorer.AzureServiceBus.Connection;
using ServiceBusExplorer.AzureServiceBus.Converters;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.AzureServiceBus.Services;

public sealed class AzureMessageOperationsService : IMessageOperationsService
{
    private readonly IConnectionManager _connectionManager;
    private readonly IServiceBusClientCache _clientCache;
    private readonly ILogger<AzureMessageOperationsService> _logger;

    public AzureMessageOperationsService(
        IConnectionManager connectionManager,
        IServiceBusClientCache clientCache,
        ILogger<AzureMessageOperationsService> logger)
    {
        _connectionManager = connectionManager;
        _clientCache = clientCache;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ServiceBusMessageDto>> PeekMessagesAsync(
        string connectionId,
        EntityPath entityPath,
        SubQueueType subQueue = SubQueueType.None,
        int maxMessages = 50,
        long? fromSequenceNumber = null,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        var receiverOptions = new ServiceBusReceiverOptions
        {
            SubQueue = subQueue switch
            {
                SubQueueType.DeadLetter => SubQueue.DeadLetter,
                SubQueueType.TransferDeadLetter => SubQueue.TransferDeadLetter,
                _ => SubQueue.None
            }
        };

        await using var receiver = CreateReceiver(client, entityPath, receiverOptions);

        IReadOnlyList<ServiceBusReceivedMessage> peeked;
        if (fromSequenceNumber.HasValue)
        {
            peeked = await receiver.PeekMessagesAsync(maxMessages, fromSequenceNumber.Value, ct);
        }
        else
        {
            peeked = await receiver.PeekMessagesAsync(maxMessages, cancellationToken: ct);
        }

        return peeked.Select(m => MessageConverter.ToDto(m, subQueue)).ToList();
    }

    public async Task<SendMessageResult> SendMessageAsync(
        string connectionId,
        EntityPath destination,
        SendMessageRequest request,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        string targetName = destination.Type switch
        {
            EntityType.Queue => destination.Name,
            EntityType.Topic => destination.Name,
            _ => throw new InvalidOperationException($"Cannot send directly to entity of type {destination.Type}")
        };

        await using var sender = client.CreateSender(targetName);
        var message = MessageConverter.ToServiceBusMessage(request);

        try
        {
            if (request.ScheduledEnqueueTime.HasValue && request.ScheduledEnqueueTime.Value > DateTimeOffset.UtcNow)
            {
                long seq = await sender.ScheduleMessageAsync(message, request.ScheduledEnqueueTime.Value, ct);
                _logger.LogInformation("Scheduled message {MessageId} to {Destination} with sequence {Seq}", message.MessageId, destination, seq);
                return new SendMessageResult(true, message.MessageId, seq);
            }
            else
            {
                await sender.SendMessageAsync(message, ct);
                _logger.LogInformation("Sent message {MessageId} to {Destination}", message.MessageId, destination);
                return new SendMessageResult(true, message.MessageId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message to {Destination}", destination);
            return new SendMessageResult(false, message.MessageId, null, ex.Message);
        }
    }

    public async Task<ResendDeadLetterResult> ResendDeadLetterAsync(
        string connectionId,
        EntityPath sourcePath,
        ResendDeadLetterRequest request,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        var dlqOptions = new ServiceBusReceiverOptions
        {
            SubQueue = SubQueue.DeadLetter,
            ReceiveMode = ServiceBusReceiveMode.PeekLock
        };

        await using var dlqReceiver = CreateReceiver(client, sourcePath, dlqOptions);

        ServiceBusReceivedMessage? lockedMessage = null;

        // Try to receive batch in PeekLock to find the specific message by sequence number
        var receivedBatch = await dlqReceiver.ReceiveMessagesAsync(maxMessages: 20, maxWaitTime: TimeSpan.FromSeconds(3), cancellationToken: ct);
        lockedMessage = receivedBatch.FirstOrDefault(m => m.SequenceNumber == request.SequenceNumber)
                     ?? receivedBatch.FirstOrDefault();

        if (lockedMessage == null)
        {
            return new ResendDeadLetterResult(false, string.Empty, false, $"Could not find or lock message with sequence {request.SequenceNumber} in DLQ.");
        }

        // Release other messages in the batch that weren't the target
        foreach (var other in receivedBatch.Where(m => m.SequenceNumber != lockedMessage.SequenceNumber))
        {
            try
            {
                await dlqReceiver.AbandonMessageAsync(other, cancellationToken: ct);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to abandon extra locked DLQ message {Seq}", other.SequenceNumber);
            }
        }

        string targetDestination = !string.IsNullOrWhiteSpace(request.TargetQueueOrTopic)
            ? request.TargetQueueOrTopic
            : (sourcePath.TopicName ?? sourcePath.Name);

        await using var targetSender = client.CreateSender(targetDestination);

        ServiceBusMessage messageToSend;
        if (request.ModifiedMessage != null)
        {
            messageToSend = MessageConverter.ToServiceBusMessage(request.ModifiedMessage);
        }
        else
        {
            // Re-create from original
            messageToSend = new ServiceBusMessage(lockedMessage.Body)
            {
                MessageId = lockedMessage.MessageId,
                CorrelationId = lockedMessage.CorrelationId,
                Subject = lockedMessage.Subject,
                ContentType = lockedMessage.ContentType,
                To = lockedMessage.To,
                ReplyTo = lockedMessage.ReplyTo,
                ReplyToSessionId = lockedMessage.ReplyToSessionId,
                SessionId = lockedMessage.SessionId,
                PartitionKey = lockedMessage.PartitionKey,
                TimeToLive = lockedMessage.TimeToLive
            };

            foreach (var (k, v) in lockedMessage.ApplicationProperties)
            {
                messageToSend.ApplicationProperties[k] = v;
            }
        }

        bool originalRemoved = false;
        try
        {
            // Step 1: Send replacement message
            await targetSender.SendMessageAsync(messageToSend, ct);
            _logger.LogInformation("Resent DLQ message {Seq} to destination {Dest}", lockedMessage.SequenceNumber, targetDestination);

            // Step 2: If send succeeded and remove was requested, complete original DLQ message
            if (request.RemoveOriginal)
            {
                await dlqReceiver.CompleteMessageAsync(lockedMessage, ct);
                originalRemoved = true;
                _logger.LogInformation("Completed original DLQ message {Seq}", lockedMessage.SequenceNumber);
            }
            else
            {
                await dlqReceiver.AbandonMessageAsync(lockedMessage, cancellationToken: ct);
            }

            return new ResendDeadLetterResult(true, messageToSend.MessageId, originalRemoved);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resend DLQ message {Seq}. Rolling back / abandoning lock.", lockedMessage.SequenceNumber);
            try
            {
                await dlqReceiver.AbandonMessageAsync(lockedMessage, cancellationToken: CancellationToken.None);
            }
            catch (Exception unlockEx)
            {
                _logger.LogWarning(unlockEx, "Failed to abandon DLQ lock after send failure.");
            }

            return new ResendDeadLetterResult(false, messageToSend.MessageId, false, ex.Message);
        }
    }

    public async Task<bool> CancelScheduledMessageAsync(
        string connectionId,
        EntityPath entityPath,
        long sequenceNumber,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        string targetName = entityPath.Type switch
        {
            EntityType.Queue => entityPath.Name,
            EntityType.Topic => entityPath.Name,
            _ => throw new InvalidOperationException($"Cannot cancel scheduled message on entity type {entityPath.Type}")
        };

        await using var sender = client.CreateSender(targetName);
        await sender.CancelScheduledMessageAsync(sequenceNumber, ct);
        return true;
    }

    public async Task<int> PurgeMessagesAsync(
        string connectionId,
        EntityPath entityPath,
        SubQueueType subQueue = SubQueueType.None,
        int maxCount = 1000,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        var options = new ServiceBusReceiverOptions
        {
            SubQueue = subQueue switch
            {
                SubQueueType.DeadLetter => SubQueue.DeadLetter,
                SubQueueType.TransferDeadLetter => SubQueue.TransferDeadLetter,
                _ => SubQueue.None
            },
            ReceiveMode = ServiceBusReceiveMode.ReceiveAndDelete
        };

        await using var receiver = CreateReceiver(client, entityPath, options);

        int totalPurged = 0;
        while (totalPurged < maxCount)
        {
            int batchSize = Math.Min(50, maxCount - totalPurged);
            var messages = await receiver.ReceiveMessagesAsync(batchSize, TimeSpan.FromSeconds(2), ct);
            if (messages.Count == 0)
                break;

            totalPurged += messages.Count;
        }

        _logger.LogInformation("Purged {Count} messages from {Path} (SubQueue: {SubQueue})", totalPurged, entityPath, subQueue);
        return totalPurged;
    }

    private static ServiceBusReceiver CreateReceiver(ServiceBusClient client, EntityPath entityPath, ServiceBusReceiverOptions options)
    {
        return entityPath.Type switch
        {
            EntityType.Queue => client.CreateReceiver(entityPath.Name, options),
            EntityType.Subscription when entityPath.TopicName != null && entityPath.SubscriptionName != null =>
                client.CreateReceiver(entityPath.TopicName, entityPath.SubscriptionName, options),
            _ => throw new InvalidOperationException($"Cannot create receiver for entity type {entityPath.Type}")
        };
    }

    private async Task<ConnectionProfile> GetRequiredConnectionAsync(string connectionId, CancellationToken ct)
    {
        var profile = await _connectionManager.GetConnectionAsync(connectionId, ct);
        if (profile == null)
        {
            throw new KeyNotFoundException($"Connection '{connectionId}' was not found.");
        }
        return profile;
    }
}
