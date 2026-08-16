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

        var options = new ServiceBusReceiverOptions
        {
            SubQueue = subQueue switch
            {
                SubQueueType.DeadLetter => SubQueue.DeadLetter,
                SubQueueType.TransferDeadLetter => SubQueue.TransferDeadLetter,
                _ => SubQueue.None
            }
        };

        await using var receiver = CreateReceiver(client, entityPath, options);

        IReadOnlyList<ServiceBusReceivedMessage> messages;
        if (fromSequenceNumber.HasValue)
        {
            messages = await receiver.PeekMessagesAsync(maxMessages, fromSequenceNumber.Value, ct);
        }
        else
        {
            messages = await receiver.PeekMessagesAsync(maxMessages, cancellationToken: ct);
        }

        return messages.Select(m => MessageConverter.ToDto(m, subQueue)).ToList();
    }

    public async Task<SendMessageResult> SendMessageAsync(
        string connectionId,
        EntityPath entityPath,
        SendMessageRequest request,
        CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var client = _clientCache.GetClient(profile);

        string destination = entityPath.Type switch
        {
            EntityType.Queue => entityPath.Name,
            EntityType.Topic => entityPath.Name,
            EntityType.Subscription => entityPath.TopicName ?? entityPath.Name,
            _ => throw new InvalidOperationException($"Unsupported entity type {entityPath.Type}")
        };

        await using var sender = client.CreateSender(destination);
        var message = MessageConverter.ToServiceBusMessage(request);

        try
        {
            await sender.SendMessageAsync(message, ct);
            _logger.LogInformation("Sent message {MessageId} to {Destination}", message.MessageId, destination);
            return new SendMessageResult(true, message.MessageId);
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
        var unneededMessages = new List<ServiceBusReceivedMessage>();

        // Receive up to 50 DLQ messages to locate the target sequence number
        for (int i = 0; i < 5; i++)
        {
            var receivedBatch = await dlqReceiver.ReceiveMessagesAsync(maxMessages: 10, maxWaitTime: TimeSpan.FromSeconds(1), cancellationToken: ct);
            if (receivedBatch == null || receivedBatch.Count == 0)
            {
                break;
            }

            foreach (var msg in receivedBatch)
            {
                if (lockedMessage == null && msg.SequenceNumber == request.SequenceNumber)
                {
                    lockedMessage = msg;
                }
                else
                {
                    unneededMessages.Add(msg);
                }
            }

            if (lockedMessage != null)
            {
                break;
            }
        }

        // If exact sequence was not found, take first if only 1 message in DLQ or fallback
        if (lockedMessage == null && unneededMessages.Count > 0)
        {
            lockedMessage = unneededMessages[0];
            unneededMessages.RemoveAt(0);
        }

        // Release any extra messages back to DLQ
        foreach (var other in unneededMessages)
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

        if (lockedMessage == null)
        {
            return new ResendDeadLetterResult(false, string.Empty, false, $"Could not find or lock message with sequence {request.SequenceNumber} in DLQ.");
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
            messageToSend = new ServiceBusMessage(lockedMessage.Body);
            if (!string.IsNullOrWhiteSpace(lockedMessage.MessageId)) messageToSend.MessageId = lockedMessage.MessageId;
            if (!string.IsNullOrWhiteSpace(lockedMessage.CorrelationId)) messageToSend.CorrelationId = lockedMessage.CorrelationId;
            if (!string.IsNullOrWhiteSpace(lockedMessage.Subject)) messageToSend.Subject = lockedMessage.Subject;
            if (!string.IsNullOrWhiteSpace(lockedMessage.ContentType)) messageToSend.ContentType = lockedMessage.ContentType;
            if (!string.IsNullOrWhiteSpace(lockedMessage.To)) messageToSend.To = lockedMessage.To;
            if (!string.IsNullOrWhiteSpace(lockedMessage.ReplyTo)) messageToSend.ReplyTo = lockedMessage.ReplyTo;
            if (!string.IsNullOrWhiteSpace(lockedMessage.ReplyToSessionId)) messageToSend.ReplyToSessionId = lockedMessage.ReplyToSessionId;
            if (!string.IsNullOrWhiteSpace(lockedMessage.SessionId)) messageToSend.SessionId = lockedMessage.SessionId;
            if (!string.IsNullOrWhiteSpace(lockedMessage.PartitionKey)) messageToSend.PartitionKey = lockedMessage.PartitionKey;
            if (lockedMessage.TimeToLive > TimeSpan.Zero && lockedMessage.TimeToLive < TimeSpan.FromDays(365)) messageToSend.TimeToLive = lockedMessage.TimeToLive;

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
            int batchToFetch = Math.Min(100, maxCount - totalPurged);
            var messages = await receiver.ReceiveMessagesAsync(batchToFetch, TimeSpan.FromSeconds(1), ct);
            if (messages == null || messages.Count == 0)
            {
                break;
            }
            totalPurged += messages.Count;
        }

        _logger.LogInformation("Purged {Count} messages from {Path} ({SubQueue})", totalPurged, entityPath, subQueue);
        return totalPurged;
    }

    private ServiceBusReceiver CreateReceiver(ServiceBusClient client, EntityPath path, ServiceBusReceiverOptions options)
    {
        return path.Type switch
        {
            EntityType.Queue => client.CreateReceiver(path.Name, options),
            EntityType.Topic => client.CreateReceiver(path.Name, options),
            EntityType.Subscription when path.TopicName != null && path.SubscriptionName != null =>
                client.CreateReceiver(path.TopicName, path.SubscriptionName, options),
            _ => throw new InvalidOperationException($"Cannot create receiver for entity type {path.Type}")
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
