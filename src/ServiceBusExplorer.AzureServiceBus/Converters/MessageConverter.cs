using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Azure.Messaging.ServiceBus;
using ServiceBusExplorer.Core.Models;

namespace ServiceBusExplorer.AzureServiceBus.Converters;

public static class MessageConverter
{
    public static ServiceBusMessageDto ToDto(ServiceBusReceivedMessage message, SubQueueType subQueue = SubQueueType.None)
    {
        var rawBody = message.Body.ToArray();
        var (textBody, format) = DetectFormatAndExtractText(rawBody, message.ContentType);

        IReadOnlyDictionary<string, object?> appProps = message.ApplicationProperties
            .ToDictionary(kvp => kvp.Key, kvp => (object?)kvp.Value);

        return new ServiceBusMessageDto(
            MessageId: message.MessageId,
            CorrelationId: message.CorrelationId,
            Subject: message.Subject,
            ContentType: message.ContentType,
            To: message.To,
            ReplyTo: message.ReplyTo,
            ReplyToSessionId: message.ReplyToSessionId,
            SessionId: message.SessionId,
            PartitionKey: message.PartitionKey,
            TransactionPartitionKey: message.TransactionPartitionKey,
            TimeToLive: message.TimeToLive,
            ScheduledEnqueueTime: message.ScheduledEnqueueTime == default ? null : message.ScheduledEnqueueTime,
            EnqueuedTime: message.EnqueuedTime == default ? null : message.EnqueuedTime,
            SequenceNumber: message.SequenceNumber,
            DeliveryCount: message.DeliveryCount,
            LockToken: message.LockToken,
            LockedUntil: message.LockedUntil == default ? null : message.LockedUntil,
            DeadLetterReason: message.DeadLetterReason,
            DeadLetterErrorDescription: message.DeadLetterErrorDescription,
            DeadLetterSource: message.DeadLetterSource,
            ApplicationProperties: appProps,
            RawBody: rawBody,
            TextBody: textBody,
            DetectedFormat: format
        );
    }

    public static ServiceBusMessage ToServiceBusMessage(SendMessageRequest request)
    {
        byte[] payloadBytes = request.Format switch
        {
            MessagePayloadFormat.Base64 => Convert.FromBase64String(request.Body),
            _ => Encoding.UTF8.GetBytes(request.Body)
        };

        var message = new ServiceBusMessage(new BinaryData(payloadBytes));

        if (!string.IsNullOrWhiteSpace(request.MessageId))
            message.MessageId = request.MessageId;

        if (!string.IsNullOrWhiteSpace(request.CorrelationId))
            message.CorrelationId = request.CorrelationId;

        if (!string.IsNullOrWhiteSpace(request.Subject))
            message.Subject = request.Subject;

        if (!string.IsNullOrWhiteSpace(request.ContentType))
            message.ContentType = request.ContentType;
        else if (request.Format == MessagePayloadFormat.Json)
            message.ContentType = "application/json";
        else if (request.Format == MessagePayloadFormat.Xml)
            message.ContentType = "application/xml";
        else if (request.Format == MessagePayloadFormat.PlainText)
            message.ContentType = "text/plain";

        if (!string.IsNullOrWhiteSpace(request.To))
            message.To = request.To;

        if (!string.IsNullOrWhiteSpace(request.ReplyTo))
            message.ReplyTo = request.ReplyTo;

        if (!string.IsNullOrWhiteSpace(request.ReplyToSessionId))
            message.ReplyToSessionId = request.ReplyToSessionId;

        if (!string.IsNullOrWhiteSpace(request.SessionId))
            message.SessionId = request.SessionId;

        if (!string.IsNullOrWhiteSpace(request.PartitionKey))
            message.PartitionKey = request.PartitionKey;

        if (request.TimeToLive.HasValue && request.TimeToLive.Value > TimeSpan.Zero)
            message.TimeToLive = request.TimeToLive.Value;

        if (request.ScheduledEnqueueTime.HasValue)
            message.ScheduledEnqueueTime = request.ScheduledEnqueueTime.Value;

        if (request.ApplicationProperties is not null)
        {
            foreach (var (k, v) in request.ApplicationProperties)
            {
                var unwrapped = UnwrapJsonElement(v);
                if (unwrapped is not null)
                {
                    message.ApplicationProperties[k] = unwrapped;
                }
            }
        }

        return message;
    }

    private static object? UnwrapJsonElement(object? value)
    {
        if (value is JsonElement element)
        {
            return element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number when element.TryGetInt64(out long l) => l,
                JsonValueKind.Number when element.TryGetDouble(out double d) => d,
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => element.GetRawText()
            };
        }
        return value;
    }

    public static (string? Text, MessagePayloadFormat Format) DetectFormatAndExtractText(byte[] rawBytes, string? contentType)
    {
        if (rawBytes.Length == 0)
        {
            return (string.Empty, MessagePayloadFormat.PlainText);
        }

        string text;
        try
        {
            text = Encoding.UTF8.GetString(rawBytes);
        }
        catch
        {
            return (Convert.ToBase64String(rawBytes), MessagePayloadFormat.Binary);
        }

        // Check if text has non-printable characters indicating binary
        if (text.Take(100).Any(c => char.IsControl(c) && c != '\r' && c != '\n' && c != '\t'))
        {
            return (Convert.ToBase64String(rawBytes), MessagePayloadFormat.Binary);
        }

        var trimmed = text.Trim();

        // Check JSON
        if ((trimmed.StartsWith("{") && trimmed.EndsWith("}")) || (trimmed.StartsWith("[") && trimmed.EndsWith("]")))
        {
            try
            {
                using var doc = JsonDocument.Parse(trimmed);
                return (text, MessagePayloadFormat.Json);
            }
            catch
            {
                // Not valid JSON
            }
        }

        // Check XML
        if (trimmed.StartsWith("<") && trimmed.EndsWith(">"))
        {
            try
            {
                XDocument.Parse(trimmed);
                return (text, MessagePayloadFormat.Xml);
            }
            catch
            {
                // Not valid XML
            }
        }

        // Check JWT (3 base64 segments separated by dots)
        if (trimmed.Count(c => c == '.') == 2 && !trimmed.Contains(' '))
        {
            var parts = trimmed.Split('.');
            if (parts.All(p => p.Length > 0 && p.Length % 4 != 1))
            {
                return (text, MessagePayloadFormat.Jwt);
            }
        }

        return (text, MessagePayloadFormat.PlainText);
    }
}
