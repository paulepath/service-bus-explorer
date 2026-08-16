namespace ServiceBusExplorer.Core.Models;

public enum MessagePayloadFormat
{
    Json,
    Xml,
    PlainText,
    Binary,
    Base64,
    Jwt
}

public sealed record ServiceBusMessageDto(
    string MessageId,
    string? CorrelationId,
    string? Subject,
    string? ContentType,
    string? To,
    string? ReplyTo,
    string? ReplyToSessionId,
    string? SessionId,
    string? PartitionKey,
    string? TransactionPartitionKey,
    TimeSpan? TimeToLive,
    DateTimeOffset? ScheduledEnqueueTime,
    DateTimeOffset? EnqueuedTime,
    long? SequenceNumber,
    int DeliveryCount,
    string? LockToken,
    DateTimeOffset? LockedUntil,
    string? DeadLetterReason,
    string? DeadLetterErrorDescription,
    string? DeadLetterSource,
    IReadOnlyDictionary<string, object?> ApplicationProperties,
    byte[] RawBody,
    string? TextBody,
    MessagePayloadFormat DetectedFormat
);

public sealed record SendMessageRequest(
    string Body,
    MessagePayloadFormat Format = MessagePayloadFormat.PlainText,
    string? MessageId = null,
    string? CorrelationId = null,
    string? Subject = null,
    string? ContentType = null,
    string? To = null,
    string? ReplyTo = null,
    string? ReplyToSessionId = null,
    string? SessionId = null,
    string? PartitionKey = null,
    TimeSpan? TimeToLive = null,
    DateTimeOffset? ScheduledEnqueueTime = null,
    IReadOnlyDictionary<string, object?>? ApplicationProperties = null
);

public sealed record SendMessageResult(
    bool Success,
    string MessageId,
    long? SequenceNumber = null,
    string? ErrorMessage = null
);

public sealed record ResendDeadLetterRequest(
    long SequenceNumber,
    string? TargetQueueOrTopic = null,
    bool RemoveOriginal = false,
    SendMessageRequest? ModifiedMessage = null
);

public sealed record ResendDeadLetterResult(
    bool Success,
    string MessageId,
    bool OriginalRemoved,
    string? ErrorMessage = null
);
