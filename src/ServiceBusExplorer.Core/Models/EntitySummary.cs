namespace ServiceBusExplorer.Core.Models;

public sealed record NamespaceOverview(
    string Name,
    int QueueCount,
    int TopicCount,
    int SubscriptionCount,
    long TotalActiveMessages,
    long TotalDeadLetterMessages
);

public sealed record EntityRuntimeCounts(
    long ActiveMessageCount,
    long DeadLetterMessageCount,
    long ScheduledMessageCount,
    long TransferDeadLetterMessageCount,
    long TotalMessageCount,
    DateTimeOffset RetrievedAt
);

public sealed record QueueSummary(
    string Name,
    EntityRuntimeCounts Counts,
    TimeSpan LockDuration,
    int MaxDeliveryCount,
    bool RequiresSession,
    bool DeadLetteringOnMessageExpiration,
    TimeSpan DefaultMessageTimeToLive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Status
);

public sealed record SubscriptionRuleSummary(
    string Name,
    string FilterType,
    string? FilterExpression,
    string? ActionExpression
);

public sealed record SubscriptionSummary(
    string TopicName,
    string SubscriptionName,
    EntityRuntimeCounts Counts,
    TimeSpan LockDuration,
    int MaxDeliveryCount,
    bool RequiresSession,
    bool DeadLetteringOnMessageExpiration,
    TimeSpan DefaultMessageTimeToLive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Status,
    IReadOnlyList<SubscriptionRuleSummary> Rules
);

public sealed record TopicSummary(
    string Name,
    long SizeInBytes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Status,
    IReadOnlyList<SubscriptionSummary> Subscriptions
);

public sealed record CreateQueueRequest(
    string Name,
    int MaxDeliveryCount = 10,
    TimeSpan? LockDuration = null,
    bool RequiresSession = false,
    bool DeadLetteringOnMessageExpiration = false
);

public sealed record CreateTopicRequest(
    string Name,
    long? MaxSizeInMegabytes = 1024
);

public sealed record CreateSubscriptionRequest(
    string SubscriptionName,
    int MaxDeliveryCount = 10,
    TimeSpan? LockDuration = null,
    bool RequiresSession = false,
    bool DeadLetteringOnMessageExpiration = false
);
