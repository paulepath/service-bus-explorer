namespace ServiceBusExplorer.Core.Models;

[Flags]
public enum ServiceBusCapabilities
{
    None = 0,
    PeekMessages = 1 << 0,
    ReceiveMessages = 1 << 1,
    SendMessages = 1 << 2,
    ScheduleMessages = 1 << 3,
    DeadLetterQueue = 1 << 4,
    Administration = 1 << 5,
    Sessions = 1 << 6,
    SubscriptionRules = 1 << 7,
    Purge = 1 << 8,
    Deferred = 1 << 9
}

public enum ConnectionType
{
    LocalEmulator,
    AzureConnectionString,
    AzureCredential
}

public sealed record ConfiguredQueue(
    string Name,
    TimeSpan? LockDuration = null,
    int MaxDeliveryCount = 10,
    bool RequiresSession = false,
    bool DeadLetteringOnMessageExpiration = false
);

public sealed record ConfiguredSubscription(
    string Name,
    IReadOnlyList<SubscriptionRuleSummary>? Rules = null
);

public sealed record ConfiguredTopic(
    string Name,
    IReadOnlyList<ConfiguredSubscription> Subscriptions
);

public sealed record ConnectionProfile(
    string Id,
    string Name,
    ConnectionType Type,
    string? ConnectionString,
    string? FullyQualifiedNamespace,
    bool IsDiscovered,
    ServiceBusCapabilities Capabilities,
    IReadOnlyList<ConfiguredQueue>? ConfiguredQueues = null,
    IReadOnlyList<ConfiguredTopic>? ConfiguredTopics = null,
    string? ContainerId = null,
    string? ConfigFilePath = null
);
