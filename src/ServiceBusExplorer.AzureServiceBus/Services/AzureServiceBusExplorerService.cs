using Azure.Messaging.ServiceBus;
using Azure.Messaging.ServiceBus.Administration;
using Microsoft.Extensions.Logging;
using ServiceBusExplorer.AzureServiceBus.Connection;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.AzureServiceBus.Services;

public sealed class AzureServiceBusExplorerService : IServiceBusExplorerService
{
    private readonly IConnectionManager _connectionManager;
    private readonly IServiceBusClientCache _clientCache;
    private readonly ILogger<AzureServiceBusExplorerService> _logger;

    public AzureServiceBusExplorerService(
        IConnectionManager connectionManager,
        IServiceBusClientCache clientCache,
        ILogger<AzureServiceBusExplorerService> logger)
    {
        _connectionManager = connectionManager;
        _clientCache = clientCache;
        _logger = logger;
    }

    public async Task<NamespaceOverview> GetNamespaceOverviewAsync(string connectionId, CancellationToken ct = default)
    {
        var queues = await GetQueuesAsync(connectionId, ct);
        var topics = await GetTopicsAsync(connectionId, ct);

        int subCount = topics.Sum(t => t.Subscriptions.Count);
        long active = queues.Sum(q => q.Counts.ActiveMessageCount) + topics.Sum(t => t.Subscriptions.Sum(s => s.Counts.ActiveMessageCount));
        long dlq = queues.Sum(q => q.Counts.DeadLetterMessageCount) + topics.Sum(t => t.Subscriptions.Sum(s => s.Counts.DeadLetterMessageCount));

        var connection = await _connectionManager.GetConnectionAsync(connectionId, ct);
        string name = connection?.Name ?? connectionId;

        return new NamespaceOverview(
            Name: name,
            QueueCount: queues.Count,
            TopicCount: topics.Count,
            SubscriptionCount: subCount,
            TotalActiveMessages: active,
            TotalDeadLetterMessages: dlq
        );
    }

    public async Task<IReadOnlyList<QueueSummary>> GetQueuesAsync(string connectionId, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        var result = new List<QueueSummary>();

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            try
            {
                await foreach (var queue in adminClient.GetQueuesAsync(ct))
                {
                    EntityRuntimeCounts counts;
                    DateTimeOffset createdAt = DateTimeOffset.UtcNow;
                    DateTimeOffset updatedAt = DateTimeOffset.UtcNow;

                    try
                    {
                        var runtime = await adminClient.GetQueueRuntimePropertiesAsync(queue.Name, ct);
                        createdAt = runtime.Value.CreatedAt;
                        updatedAt = runtime.Value.UpdatedAt;
                        counts = new EntityRuntimeCounts(
                            ActiveMessageCount: runtime.Value.ActiveMessageCount,
                            DeadLetterMessageCount: runtime.Value.DeadLetterMessageCount,
                            ScheduledMessageCount: runtime.Value.ScheduledMessageCount,
                            TransferDeadLetterMessageCount: runtime.Value.TransferDeadLetterMessageCount,
                            TotalMessageCount: runtime.Value.TotalMessageCount,
                            RetrievedAt: DateTimeOffset.UtcNow
                        );
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Could not fetch runtime properties for queue {QueueName}", queue.Name);
                        counts = await EstimateCountsViaReceiverAsync(profile, EntityPath.ForQueue(queue.Name), ct);
                    }

                    result.Add(new QueueSummary(
                        Name: queue.Name,
                        Counts: counts,
                        LockDuration: queue.LockDuration,
                        MaxDeliveryCount: queue.MaxDeliveryCount,
                        RequiresSession: queue.RequiresSession,
                        DeadLetteringOnMessageExpiration: queue.DeadLetteringOnMessageExpiration,
                        DefaultMessageTimeToLive: queue.DefaultMessageTimeToLive,
                        CreatedAt: createdAt,
                        UpdatedAt: updatedAt,
                        Status: queue.Status.ToString()
                    ));
                }

                if (result.Count > 0)
                {
                    return result;
                }
            }
            catch (Exception ex)
            {
                _logger.LogInformation(ex, "AdminClient.GetQueuesAsync failed or not supported on this connection.");
            }
        }

        // For Local Emulator: Use ConfiguredQueues discovered from container and probe live counts
        if (profile.ConfiguredQueues != null && profile.ConfiguredQueues.Count > 0)
        {
            foreach (var q in profile.ConfiguredQueues)
            {
                var counts = await EstimateCountsViaReceiverAsync(profile, EntityPath.ForQueue(q.Name), ct);
                result.Add(new QueueSummary(
                    Name: q.Name,
                    Counts: counts,
                    LockDuration: q.LockDuration ?? TimeSpan.FromMinutes(1),
                    MaxDeliveryCount: q.MaxDeliveryCount,
                    RequiresSession: q.RequiresSession,
                    DeadLetteringOnMessageExpiration: q.DeadLetteringOnMessageExpiration,
                    DefaultMessageTimeToLive: TimeSpan.FromHours(1),
                    CreatedAt: DateTimeOffset.UtcNow,
                    UpdatedAt: DateTimeOffset.UtcNow,
                    Status: "Active"
                ));
            }
        }

        return result;
    }

    public async Task<IReadOnlyList<TopicSummary>> GetTopicsAsync(string connectionId, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        var result = new List<TopicSummary>();

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            try
            {
                await foreach (var topic in adminClient.GetTopicsAsync(ct))
                {
                    var subscriptions = new List<SubscriptionSummary>();
                    DateTimeOffset topicCreatedAt = DateTimeOffset.UtcNow;
                    DateTimeOffset topicUpdatedAt = DateTimeOffset.UtcNow;

                    try
                    {
                        var topicRuntime = await adminClient.GetTopicRuntimePropertiesAsync(topic.Name, ct);
                        topicCreatedAt = topicRuntime.Value.CreatedAt;
                        topicUpdatedAt = topicRuntime.Value.UpdatedAt;
                    }
                    catch
                    {
                        // Ignore
                    }

                    try
                    {
                        await foreach (var sub in adminClient.GetSubscriptionsAsync(topic.Name, ct))
                        {
                            EntityRuntimeCounts counts;
                            DateTimeOffset subCreatedAt = DateTimeOffset.UtcNow;
                            DateTimeOffset subUpdatedAt = DateTimeOffset.UtcNow;

                            try
                            {
                                var runtime = await adminClient.GetSubscriptionRuntimePropertiesAsync(topic.Name, sub.SubscriptionName, ct);
                                subCreatedAt = runtime.Value.CreatedAt;
                                subUpdatedAt = runtime.Value.UpdatedAt;
                                counts = new EntityRuntimeCounts(
                                    ActiveMessageCount: runtime.Value.ActiveMessageCount,
                                    DeadLetterMessageCount: runtime.Value.DeadLetterMessageCount,
                                    ScheduledMessageCount: 0,
                                    TransferDeadLetterMessageCount: runtime.Value.TransferDeadLetterMessageCount,
                                    TotalMessageCount: runtime.Value.TotalMessageCount,
                                    RetrievedAt: DateTimeOffset.UtcNow
                                );
                            }
                            catch
                            {
                                counts = await EstimateCountsViaReceiverAsync(profile, EntityPath.ForSubscription(topic.Name, sub.SubscriptionName), ct);
                            }

                            var rules = new List<SubscriptionRuleSummary>();
                            try
                            {
                                await foreach (var rule in adminClient.GetRulesAsync(topic.Name, sub.SubscriptionName, ct))
                                {
                                    rules.Add(new SubscriptionRuleSummary(
                                        Name: rule.Name,
                                        FilterType: rule.Filter.GetType().Name,
                                        FilterExpression: rule.Filter switch
                                        {
                                            SqlRuleFilter sql => sql.SqlExpression,
                                            CorrelationRuleFilter cor => $"CorrelationId: {cor.CorrelationId}, Subject: {cor.Subject}",
                                            _ => rule.Filter.ToString()
                                        },
                                        ActionExpression: rule.Action switch
                                        {
                                            SqlRuleAction sqlAction => sqlAction.SqlExpression,
                                            _ => null
                                        }
                                    ));
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogDebug(ex, "Could not fetch rules for subscription {Sub} on topic {Topic}", sub.SubscriptionName, topic.Name);
                            }

                            subscriptions.Add(new SubscriptionSummary(
                                TopicName: topic.Name,
                                SubscriptionName: sub.SubscriptionName,
                                Counts: counts,
                                LockDuration: sub.LockDuration,
                                MaxDeliveryCount: sub.MaxDeliveryCount,
                                RequiresSession: sub.RequiresSession,
                                DeadLetteringOnMessageExpiration: sub.DeadLetteringOnMessageExpiration,
                                DefaultMessageTimeToLive: sub.DefaultMessageTimeToLive,
                                CreatedAt: subCreatedAt,
                                UpdatedAt: subUpdatedAt,
                                Status: sub.Status.ToString(),
                                Rules: rules
                            ));
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Could not enumerate subscriptions for topic {Topic}", topic.Name);
                    }

                    result.Add(new TopicSummary(
                        Name: topic.Name,
                        SizeInBytes: topic.MaxSizeInMegabytes * 1024 * 1024,
                        CreatedAt: topicCreatedAt,
                        UpdatedAt: topicUpdatedAt,
                        Status: topic.Status.ToString(),
                        Subscriptions: subscriptions
                    ));
                }

                if (result.Count > 0)
                {
                    return result;
                }
            }
            catch (Exception ex)
            {
                _logger.LogInformation(ex, "AdminClient.GetTopicsAsync failed or not supported on this connection.");
            }
        }

        // For Local Emulator: Use ConfiguredTopics
        if (profile.ConfiguredTopics != null && profile.ConfiguredTopics.Count > 0)
        {
            foreach (var t in profile.ConfiguredTopics)
            {
                var subs = new List<SubscriptionSummary>();
                foreach (var s in t.Subscriptions)
                {
                    var counts = await EstimateCountsViaReceiverAsync(profile, EntityPath.ForSubscription(t.Name, s.Name), ct);
                    subs.Add(new SubscriptionSummary(
                        TopicName: t.Name,
                        SubscriptionName: s.Name,
                        Counts: counts,
                        LockDuration: TimeSpan.FromMinutes(1),
                        MaxDeliveryCount: 10,
                        RequiresSession: false,
                        DeadLetteringOnMessageExpiration: false,
                        DefaultMessageTimeToLive: TimeSpan.FromHours(1),
                        CreatedAt: DateTimeOffset.UtcNow,
                        UpdatedAt: DateTimeOffset.UtcNow,
                        Status: "Active",
                        Rules: s.Rules ?? Array.Empty<SubscriptionRuleSummary>()
                    ));
                }

                result.Add(new TopicSummary(
                    Name: t.Name,
                    SizeInBytes: 1024 * 1024 * 1024,
                    CreatedAt: DateTimeOffset.UtcNow,
                    UpdatedAt: DateTimeOffset.UtcNow,
                    Status: "Active",
                    Subscriptions: subs
                ));
            }
        }

        return result;
    }

    public async Task<QueueSummary?> GetQueueAsync(string connectionId, string queueName, CancellationToken ct = default)
    {
        var queues = await GetQueuesAsync(connectionId, ct);
        return queues.FirstOrDefault(q => string.Equals(q.Name, queueName, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<TopicSummary?> GetTopicAsync(string connectionId, string topicName, CancellationToken ct = default)
    {
        var topics = await GetTopicsAsync(connectionId, ct);
        return topics.FirstOrDefault(t => string.Equals(t.Name, topicName, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<SubscriptionSummary?> GetSubscriptionAsync(string connectionId, string topicName, string subscriptionName, CancellationToken ct = default)
    {
        var topic = await GetTopicAsync(connectionId, topicName, ct);
        return topic?.Subscriptions.FirstOrDefault(s => string.Equals(s.SubscriptionName, subscriptionName, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<EntityRuntimeCounts> GetEntityCountsAsync(string connectionId, EntityPath entityPath, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            try
            {
                if (entityPath.Type == EntityType.Queue)
                {
                    var runtime = await adminClient.GetQueueRuntimePropertiesAsync(entityPath.Name, ct);
                    return new EntityRuntimeCounts(
                        ActiveMessageCount: runtime.Value.ActiveMessageCount,
                        DeadLetterMessageCount: runtime.Value.DeadLetterMessageCount,
                        ScheduledMessageCount: runtime.Value.ScheduledMessageCount,
                        TransferDeadLetterMessageCount: runtime.Value.TransferDeadLetterMessageCount,
                        TotalMessageCount: runtime.Value.TotalMessageCount,
                        RetrievedAt: DateTimeOffset.UtcNow
                    );
                }
                else if (entityPath.Type == EntityType.Subscription && entityPath.TopicName != null && entityPath.SubscriptionName != null)
                {
                    var runtime = await adminClient.GetSubscriptionRuntimePropertiesAsync(entityPath.TopicName, entityPath.SubscriptionName, ct);
                    return new EntityRuntimeCounts(
                        ActiveMessageCount: runtime.Value.ActiveMessageCount,
                        DeadLetterMessageCount: runtime.Value.DeadLetterMessageCount,
                        ScheduledMessageCount: 0,
                        TransferDeadLetterMessageCount: runtime.Value.TransferDeadLetterMessageCount,
                        TotalMessageCount: runtime.Value.TotalMessageCount,
                        RetrievedAt: DateTimeOffset.UtcNow
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "AdminClient runtime counts failed for {Path}", entityPath);
            }
        }

        return await EstimateCountsViaReceiverAsync(profile, entityPath, ct);
    }

    public async Task<QueueSummary> CreateQueueAsync(string connectionId, CreateQueueRequest request, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            var options = new CreateQueueOptions(request.Name)
            {
                MaxDeliveryCount = request.MaxDeliveryCount,
                RequiresSession = request.RequiresSession,
                DeadLetteringOnMessageExpiration = request.DeadLetteringOnMessageExpiration
            };
            if (request.LockDuration.HasValue) options.LockDuration = request.LockDuration.Value;

            var created = await adminClient.CreateQueueAsync(options, ct);
            return new QueueSummary(
                Name: created.Value.Name,
                Counts: new EntityRuntimeCounts(0, 0, 0, 0, 0, DateTimeOffset.UtcNow),
                LockDuration: created.Value.LockDuration,
                MaxDeliveryCount: created.Value.MaxDeliveryCount,
                RequiresSession: created.Value.RequiresSession,
                DeadLetteringOnMessageExpiration: created.Value.DeadLetteringOnMessageExpiration,
                DefaultMessageTimeToLive: created.Value.DefaultMessageTimeToLive,
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                Status: created.Value.Status.ToString()
            );
        }

        // Emulator: Add to ConfiguredQueues
        var currentQueues = profile.ConfiguredQueues?.ToList() ?? new List<ConfiguredQueue>();
        if (!currentQueues.Any(q => string.Equals(q.Name, request.Name, StringComparison.OrdinalIgnoreCase)))
        {
            currentQueues.Add(new ConfiguredQueue(
                Name: request.Name,
                LockDuration: request.LockDuration ?? TimeSpan.FromMinutes(1),
                MaxDeliveryCount: request.MaxDeliveryCount,
                RequiresSession: request.RequiresSession,
                DeadLetteringOnMessageExpiration: request.DeadLetteringOnMessageExpiration
            ));
            var updated = profile with { ConfiguredQueues = currentQueues };
            await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
        }

        return new QueueSummary(
            Name: request.Name,
            Counts: new EntityRuntimeCounts(0, 0, 0, 0, 0, DateTimeOffset.UtcNow),
            LockDuration: request.LockDuration ?? TimeSpan.FromMinutes(1),
            MaxDeliveryCount: request.MaxDeliveryCount,
            RequiresSession: request.RequiresSession,
            DeadLetteringOnMessageExpiration: request.DeadLetteringOnMessageExpiration,
            DefaultMessageTimeToLive: TimeSpan.FromHours(1),
            CreatedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            Status: "Active"
        );
    }

    public async Task<bool> DeleteQueueAsync(string connectionId, string queueName, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            await adminClient.DeleteQueueAsync(queueName, ct);
            return true;
        }

        if (profile.ConfiguredQueues != null)
        {
            var filtered = profile.ConfiguredQueues.Where(q => !string.Equals(q.Name, queueName, StringComparison.OrdinalIgnoreCase)).ToList();
            var updated = profile with { ConfiguredQueues = filtered };
            await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
            return true;
        }

        return false;
    }

    public async Task<TopicSummary> CreateTopicAsync(string connectionId, CreateTopicRequest request, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            var options = new CreateTopicOptions(request.Name);
            if (request.MaxSizeInMegabytes.HasValue) options.MaxSizeInMegabytes = request.MaxSizeInMegabytes.Value;

            var created = await adminClient.CreateTopicAsync(options, ct);
            return new TopicSummary(
                Name: created.Value.Name,
                SizeInBytes: created.Value.MaxSizeInMegabytes * 1024 * 1024,
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                Status: created.Value.Status.ToString(),
                Subscriptions: Array.Empty<SubscriptionSummary>()
            );
        }

        var currentTopics = profile.ConfiguredTopics?.ToList() ?? new List<ConfiguredTopic>();
        if (!currentTopics.Any(t => string.Equals(t.Name, request.Name, StringComparison.OrdinalIgnoreCase)))
        {
            currentTopics.Add(new ConfiguredTopic(
                Name: request.Name,
                Subscriptions: Array.Empty<ConfiguredSubscription>()
            ));
            var updated = profile with { ConfiguredTopics = currentTopics };
            await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
        }

        return new TopicSummary(
            Name: request.Name,
            SizeInBytes: (request.MaxSizeInMegabytes ?? 1024) * 1024 * 1024,
            CreatedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            Status: "Active",
            Subscriptions: Array.Empty<SubscriptionSummary>()
        );
    }

    public async Task<bool> DeleteTopicAsync(string connectionId, string topicName, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            await adminClient.DeleteTopicAsync(topicName, ct);
            return true;
        }

        if (profile.ConfiguredTopics != null)
        {
            var filtered = profile.ConfiguredTopics.Where(t => !string.Equals(t.Name, topicName, StringComparison.OrdinalIgnoreCase)).ToList();
            var updated = profile with { ConfiguredTopics = filtered };
            await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
            return true;
        }

        return false;
    }

    public async Task<SubscriptionSummary> CreateSubscriptionAsync(string connectionId, string topicName, CreateSubscriptionRequest request, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            var options = new CreateSubscriptionOptions(topicName, request.SubscriptionName)
            {
                MaxDeliveryCount = request.MaxDeliveryCount,
                RequiresSession = request.RequiresSession,
                DeadLetteringOnMessageExpiration = request.DeadLetteringOnMessageExpiration
            };
            if (request.LockDuration.HasValue) options.LockDuration = request.LockDuration.Value;

            var created = await adminClient.CreateSubscriptionAsync(options, ct);
            return new SubscriptionSummary(
                TopicName: topicName,
                SubscriptionName: created.Value.SubscriptionName,
                Counts: new EntityRuntimeCounts(0, 0, 0, 0, 0, DateTimeOffset.UtcNow),
                LockDuration: created.Value.LockDuration,
                MaxDeliveryCount: created.Value.MaxDeliveryCount,
                RequiresSession: created.Value.RequiresSession,
                DeadLetteringOnMessageExpiration: created.Value.DeadLetteringOnMessageExpiration,
                DefaultMessageTimeToLive: created.Value.DefaultMessageTimeToLive,
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                Status: created.Value.Status.ToString(),
                Rules: Array.Empty<SubscriptionRuleSummary>()
            );
        }

        var currentTopics = profile.ConfiguredTopics?.ToList() ?? new List<ConfiguredTopic>();
        var topicIndex = currentTopics.FindIndex(t => string.Equals(t.Name, topicName, StringComparison.OrdinalIgnoreCase));
        if (topicIndex >= 0)
        {
            var topic = currentTopics[topicIndex];
            var subs = topic.Subscriptions?.ToList() ?? new List<ConfiguredSubscription>();
            if (!subs.Any(s => string.Equals(s.Name, request.SubscriptionName, StringComparison.OrdinalIgnoreCase)))
            {
                subs.Add(new ConfiguredSubscription(request.SubscriptionName, Array.Empty<SubscriptionRuleSummary>()));
                currentTopics[topicIndex] = topic with { Subscriptions = subs };
                var updated = profile with { ConfiguredTopics = currentTopics };
                await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
            }
        }

        return new SubscriptionSummary(
            TopicName: topicName,
            SubscriptionName: request.SubscriptionName,
            Counts: new EntityRuntimeCounts(0, 0, 0, 0, 0, DateTimeOffset.UtcNow),
            LockDuration: request.LockDuration ?? TimeSpan.FromMinutes(1),
            MaxDeliveryCount: request.MaxDeliveryCount,
            RequiresSession: request.RequiresSession,
            DeadLetteringOnMessageExpiration: request.DeadLetteringOnMessageExpiration,
            DefaultMessageTimeToLive: TimeSpan.FromHours(1),
            CreatedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            Status: "Active",
            Rules: Array.Empty<SubscriptionRuleSummary>()
        );
    }

    public async Task<bool> DeleteSubscriptionAsync(string connectionId, string topicName, string subscriptionName, CancellationToken ct = default)
    {
        var profile = await GetRequiredConnectionAsync(connectionId, ct);
        var adminClient = _clientCache.GetAdminClient(profile);

        if (adminClient != null && profile.Type != ConnectionType.LocalEmulator)
        {
            await adminClient.DeleteSubscriptionAsync(topicName, subscriptionName, ct);
            return true;
        }

        if (profile.ConfiguredTopics != null)
        {
            var currentTopics = profile.ConfiguredTopics.ToList();
            var topicIndex = currentTopics.FindIndex(t => string.Equals(t.Name, topicName, StringComparison.OrdinalIgnoreCase));
            if (topicIndex >= 0)
            {
                var topic = currentTopics[topicIndex];
                var filteredSubs = topic.Subscriptions?.Where(s => !string.Equals(s.Name, subscriptionName, StringComparison.OrdinalIgnoreCase)).ToList() ?? new List<ConfiguredSubscription>();
                currentTopics[topicIndex] = topic with { Subscriptions = filteredSubs };
                var updated = profile with { ConfiguredTopics = currentTopics };
                await _connectionManager.UpdateConnectionProfileAsync(updated, ct);
                return true;
            }
        }

        return false;
    }

    private async Task<EntityRuntimeCounts> EstimateCountsViaReceiverAsync(ConnectionProfile profile, EntityPath entityPath, CancellationToken ct)
    {
        try
        {
            var client = _clientCache.GetClient(profile);
            ServiceBusReceiver activeReceiver = entityPath.Type switch
            {
                EntityType.Queue => client.CreateReceiver(entityPath.Name),
                EntityType.Subscription when entityPath.TopicName != null && entityPath.SubscriptionName != null =>
                    client.CreateReceiver(entityPath.TopicName, entityPath.SubscriptionName),
                _ => throw new InvalidOperationException($"Cannot peek counts for entity type {entityPath.Type}")
            };

            var peekedActive = await activeReceiver.PeekMessagesAsync(100, cancellationToken: ct);
            await activeReceiver.DisposeAsync();

            ServiceBusReceiver dlqReceiver = entityPath.Type switch
            {
                EntityType.Queue => client.CreateReceiver(entityPath.Name, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter }),
                EntityType.Subscription when entityPath.TopicName != null && entityPath.SubscriptionName != null =>
                    client.CreateReceiver(entityPath.TopicName, entityPath.SubscriptionName, new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter }),
                _ => throw new InvalidOperationException($"Cannot peek counts for entity type {entityPath.Type}")
            };

            var peekedDlq = await dlqReceiver.PeekMessagesAsync(100, cancellationToken: ct);
            await dlqReceiver.DisposeAsync();

            return new EntityRuntimeCounts(
                ActiveMessageCount: peekedActive.Count,
                DeadLetterMessageCount: peekedDlq.Count,
                ScheduledMessageCount: 0,
                TransferDeadLetterMessageCount: 0,
                TotalMessageCount: peekedActive.Count + peekedDlq.Count,
                RetrievedAt: DateTimeOffset.UtcNow
            );
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not estimate counts via receiver for {Path}", entityPath);
            return new EntityRuntimeCounts(0, 0, 0, 0, 0, DateTimeOffset.UtcNow);
        }
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
