using System.Text.Json;
using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Logging.Abstractions;
using ServiceBusExplorer.AzureServiceBus.Connection;
using ServiceBusExplorer.AzureServiceBus.Services;
using ServiceBusExplorer.Core.Models;
using Xunit;

namespace ServiceBusExplorer.IntegrationTests;

public class ServiceBusEmulatorIntegrationTests : IAsyncDisposable
{
    private const string EmulatorConnectionString = "Endpoint=sb://127.0.0.1:5673;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;";
    private readonly InMemoryConnectionManager _connectionManager;
    private readonly ServiceBusClientCache _clientCache;
    private readonly AzureServiceBusExplorerService _explorerService;
    private readonly AzureMessageOperationsService _messageOps;
    private readonly ConnectionProfile _profile;

    public ServiceBusEmulatorIntegrationTests()
    {
        _connectionManager = new InMemoryConnectionManager();
        _clientCache = new ServiceBusClientCache();
        _explorerService = new AzureServiceBusExplorerService(_connectionManager, _clientCache, NullLogger<AzureServiceBusExplorerService>.Instance);
        _messageOps = new AzureMessageOperationsService(_connectionManager, _clientCache, NullLogger<AzureMessageOperationsService>.Instance);

        _profile = new ConnectionProfile(
            Id: "local-emulator",
            Name: "Local Test Emulator",
            Type: ConnectionType.LocalEmulator,
            ConnectionString: EmulatorConnectionString,
            FullyQualifiedNamespace: "sbemulatorns",
            IsDiscovered: true,
            Capabilities: ServiceBusCapabilities.None
        );

        _connectionManager.AddConnectionAsync(_profile).GetAwaiter().GetResult();
    }

    [Fact]
    public async Task Can_Send_And_Peek_Message_On_NormalQueue()
    {
        // Arrange
        var queuePath = EntityPath.ForQueue("normal-queue");
        string testMessageId = $"test-msg-{Guid.NewGuid():N}";
        var payload = new { OrderId = 12345, Customer = "Alice", Total = 99.95 };
        var json = JsonSerializer.Serialize(payload);

        var request = new SendMessageRequest(
            Body: json,
            Format: MessagePayloadFormat.Json,
            MessageId: testMessageId,
            Subject: "OrderCreated",
            ApplicationProperties: new Dictionary<string, object?>
            {
                ["tenantId"] = "tenant-001",
                ["retryCount"] = 0
            }
        );

        // Act - Send
        var sendResult = await _messageOps.SendMessageAsync(_profile.Id, queuePath, request);
        Assert.True(sendResult.Success, sendResult.ErrorMessage);
        Assert.Equal(testMessageId, sendResult.MessageId);

        // Act - Safe Peek
        var peekedMessages = await _messageOps.PeekMessagesAsync(_profile.Id, queuePath, SubQueueType.None, maxMessages: 50);

        // Assert
        var found = peekedMessages.FirstOrDefault(m => m.MessageId == testMessageId);
        Assert.NotNull(found);
        Assert.Equal(MessagePayloadFormat.Json, found.DetectedFormat);
        Assert.Equal("OrderCreated", found.Subject);
        Assert.Equal("tenant-001", found.ApplicationProperties["tenantId"]?.ToString());
        Assert.NotNull(found.TextBody);
        Assert.Contains("12345", found.TextBody);
    }

    [Fact]
    public async Task Can_Send_To_Topic_And_Peek_From_Subscription()
    {
        // Arrange
        var topicPath = EntityPath.ForTopic("test-topic");
        var subPath = EntityPath.ForSubscription("test-topic", "subscription-all");
        string testMessageId = $"topic-msg-{Guid.NewGuid():N}";

        var request = new SendMessageRequest(
            Body: "{\"event\":\"user.signup\",\"user\":\"Bob\"}",
            Format: MessagePayloadFormat.Json,
            MessageId: testMessageId,
            Subject: "UserSignedUp"
        );

        // Act - Send to Topic
        var sendResult = await _messageOps.SendMessageAsync(_profile.Id, topicPath, request);
        Assert.True(sendResult.Success, sendResult.ErrorMessage);

        // Give subscription a moment to receive broadcast
        await Task.Delay(1000);

        // Act - Peek from Subscription
        var peeked = await _messageOps.PeekMessagesAsync(_profile.Id, subPath, SubQueueType.None, maxMessages: 20);

        // Assert
        var found = peeked.FirstOrDefault(m => m.MessageId == testMessageId);
        Assert.NotNull(found);
        Assert.Equal("UserSignedUp", found.Subject);
    }

    [Fact]
    public async Task Can_Resend_And_Remove_DLQ_Message_Safely()
    {
        // Arrange: send a message directly to deadletter-test queue and let it go to DLQ or dead-letter it
        var client = _clientCache.GetClient(_profile);
        var sender = client.CreateSender("deadletter-test");

        string testMessageId = $"dlq-orig-{Guid.NewGuid():N}";
        var originalMsg = new ServiceBusMessage("Faulty payload")
        {
            MessageId = testMessageId,
            Subject = "NeedsDeadLetter"
        };
        await sender.SendMessageAsync(originalMsg);
        await sender.DisposeAsync();

        // Receive with peeklock and dead-letter it
        var receiver = client.CreateReceiver("deadletter-test", new ServiceBusReceiverOptions { ReceiveMode = ServiceBusReceiveMode.PeekLock });
        var received = await receiver.ReceiveMessageAsync(TimeSpan.FromSeconds(5));
        Assert.NotNull(received);
        await receiver.DeadLetterMessageAsync(received, "DataCorrupt", "Payload failed validation");
        await receiver.DisposeAsync();

        // Verify it is in DLQ
        var dlqPath = EntityPath.ForQueue("deadletter-test");
        var dlqMessages = await _messageOps.PeekMessagesAsync(_profile.Id, dlqPath, SubQueueType.DeadLetter, maxMessages: 10);
        var dlqItem = dlqMessages.FirstOrDefault(m => m.MessageId == testMessageId);
        Assert.NotNull(dlqItem);
        Assert.Equal("DataCorrupt", dlqItem.DeadLetterReason);

        // Act: Resend & Remove original to normal-queue
        var resendRequest = new ResendDeadLetterRequest(
            SequenceNumber: dlqItem.SequenceNumber!.Value,
            TargetQueueOrTopic: "normal-queue",
            RemoveOriginal: true
        );

        var resendResult = await _messageOps.ResendDeadLetterAsync(_profile.Id, dlqPath, resendRequest);

        // Assert
        Assert.True(resendResult.Success, resendResult.ErrorMessage);
        Assert.True(resendResult.OriginalRemoved);

        // Confirm replacement landed in normal-queue
        var normalMessages = await _messageOps.PeekMessagesAsync(_profile.Id, EntityPath.ForQueue("normal-queue"), SubQueueType.None, maxMessages: 20);
        Assert.Contains(normalMessages, m => m.MessageId == testMessageId);
    }

    public async ValueTask DisposeAsync()
    {
        await _clientCache.DisposeAsync();
    }
}
