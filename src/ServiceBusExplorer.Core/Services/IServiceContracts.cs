using ServiceBusExplorer.Core.Models;

namespace ServiceBusExplorer.Core.Services;

public interface IConnectionManager
{
    Task<IReadOnlyList<ConnectionProfile>> GetAllConnectionsAsync(CancellationToken ct = default);
    Task<ConnectionProfile?> GetConnectionAsync(string connectionId, CancellationToken ct = default);
    Task<ConnectionProfile> AddConnectionAsync(ConnectionProfile profile, CancellationToken ct = default);
    Task<bool> RemoveConnectionAsync(string connectionId, CancellationToken ct = default);
    Task RegisterDiscoveredConnectionsAsync(IEnumerable<ConnectionProfile> profiles, CancellationToken ct = default);
    Task UpdateConnectionProfileAsync(ConnectionProfile profile, CancellationToken ct = default);
}

public interface IServiceBusExplorerService
{
    Task<NamespaceOverview> GetNamespaceOverviewAsync(string connectionId, CancellationToken ct = default);
    Task<IReadOnlyList<QueueSummary>> GetQueuesAsync(string connectionId, CancellationToken ct = default);
    Task<IReadOnlyList<TopicSummary>> GetTopicsAsync(string connectionId, CancellationToken ct = default);
    Task<QueueSummary?> GetQueueAsync(string connectionId, string queueName, CancellationToken ct = default);
    Task<TopicSummary?> GetTopicAsync(string connectionId, string topicName, CancellationToken ct = default);
    Task<SubscriptionSummary?> GetSubscriptionAsync(string connectionId, string topicName, string subscriptionName, CancellationToken ct = default);
    Task<EntityRuntimeCounts> GetEntityCountsAsync(string connectionId, EntityPath entityPath, CancellationToken ct = default);

    Task<QueueSummary> CreateQueueAsync(string connectionId, CreateQueueRequest request, CancellationToken ct = default);
    Task<bool> DeleteQueueAsync(string connectionId, string queueName, CancellationToken ct = default);

    Task<TopicSummary> CreateTopicAsync(string connectionId, CreateTopicRequest request, CancellationToken ct = default);
    Task<bool> DeleteTopicAsync(string connectionId, string topicName, CancellationToken ct = default);

    Task<SubscriptionSummary> CreateSubscriptionAsync(string connectionId, string topicName, CreateSubscriptionRequest request, CancellationToken ct = default);
    Task<bool> DeleteSubscriptionAsync(string connectionId, string topicName, string subscriptionName, CancellationToken ct = default);
}

public interface IMessageOperationsService
{
    Task<IReadOnlyList<ServiceBusMessageDto>> PeekMessagesAsync(
        string connectionId,
        EntityPath entityPath,
        SubQueueType subQueue = SubQueueType.None,
        int maxMessages = 50,
        long? fromSequenceNumber = null,
        CancellationToken ct = default);

    Task<SendMessageResult> SendMessageAsync(
        string connectionId,
        EntityPath destination,
        SendMessageRequest message,
        CancellationToken ct = default);

    Task<ResendDeadLetterResult> ResendDeadLetterAsync(
        string connectionId,
        EntityPath sourcePath,
        ResendDeadLetterRequest request,
        CancellationToken ct = default);

    Task<bool> CancelScheduledMessageAsync(
        string connectionId,
        EntityPath entityPath,
        long sequenceNumber,
        CancellationToken ct = default);

    Task<int> PurgeMessagesAsync(
        string connectionId,
        EntityPath entityPath,
        SubQueueType subQueue = SubQueueType.None,
        int maxCount = 1000,
        CancellationToken ct = default);

    Task<DeleteMessagesResult> DeleteMessagesAsync(
        string connectionId,
        EntityPath entityPath,
        IEnumerable<long> sequenceNumbers,
        SubQueueType subQueue = SubQueueType.None,
        CancellationToken ct = default);
}


public interface IDiscoveryProvider
{
    string ProviderName { get; }
    Task<IReadOnlyList<ConnectionProfile>> DiscoverAsync(CancellationToken ct = default);
}
