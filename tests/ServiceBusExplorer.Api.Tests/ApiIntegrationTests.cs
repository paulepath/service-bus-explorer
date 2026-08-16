using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using ServiceBusExplorer.Api.Endpoints;
using ServiceBusExplorer.Core.Converters;
using ServiceBusExplorer.Core.Models;
using Xunit;

namespace ServiceBusExplorer.Api.Tests;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;
    private const string EmulatorConnStr = "Endpoint=sb://127.0.0.1:5673;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;";

    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters =
        {
            new JsonStringEnumConverter(),
            new FlexibleTimeSpanJsonConverter(),
            new NullableFlexibleTimeSpanJsonConverter()
        }
    };

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Root_Returns_Ok()
    {
        var response = await _client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Discovery_And_Connection_Endpoints_Work()
    {
        // 1. Scan discovery
        var discoveryResponse = await _client.GetAsync("/api/discovery/emulators");
        Assert.Equal(HttpStatusCode.OK, discoveryResponse.StatusCode);

        // 2. Add connection
        var createRequest = new CreateConnectionRequest(
            Id: "api-test-conn",
            Name: "API Test Connection",
            Type: ConnectionType.LocalEmulator,
            ConnectionString: EmulatorConnStr,
            FullyQualifiedNamespace: "sbemulatorns"
        );

        var addResponse = await _client.PostAsJsonAsync("/api/connections", createRequest, _jsonOptions);
        Assert.Equal(HttpStatusCode.Created, addResponse.StatusCode);

        // 3. Get connections
        var listResponse = await _client.GetAsync("/api/connections");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var connections = await listResponse.Content.ReadFromJsonAsync<List<ConnectionProfile>>(_jsonOptions);
        Assert.NotNull(connections);
        Assert.Contains(connections, c => c.Id == "api-test-conn");
    }

    [Fact]
    public async Task Queue_Lifecycle_With_Various_LockDuration_Formats_Works()
    {
        // 1. Ensure connection exists
        var createRequest = new CreateConnectionRequest(
            Id: "api-queue-lifecycle-conn",
            Name: "API Queue Conn",
            Type: ConnectionType.LocalEmulator,
            ConnectionString: EmulatorConnStr,
            FullyQualifiedNamespace: "sbemulatorns"
        );
        await _client.PostAsJsonAsync("/api/connections", createRequest, _jsonOptions);

        // 2. Test create queue with NUMBER lockDuration (60)
        var jsonWithNumber = "{\"name\":\"test-queue-num\",\"maxDeliveryCount\":10,\"lockDuration\":60,\"requiresSession\":false,\"deadLetteringOnMessageExpiration\":false}";
        var contentNum = new StringContent(jsonWithNumber, System.Text.Encoding.UTF8, "application/json");
        var numResp = await _client.PostAsync("/api/connections/api-queue-lifecycle-conn/queues", contentNum);
        Assert.Equal(HttpStatusCode.Created, numResp.StatusCode);

        // 3. Test create queue with STRING lockDuration ("00:01:00")
        var jsonWithStr = "{\"name\":\"test-queue-str\",\"maxDeliveryCount\":5,\"lockDuration\":\"00:01:00\",\"requiresSession\":false,\"deadLetteringOnMessageExpiration\":true}";
        var contentStr = new StringContent(jsonWithStr, System.Text.Encoding.UTF8, "application/json");
        var strResp = await _client.PostAsync("/api/connections/api-queue-lifecycle-conn/queues", contentStr);
        Assert.Equal(HttpStatusCode.Created, strResp.StatusCode);

        // 4. Test create queue with ISO lockDuration ("PT2M")
        var jsonWithIso = "{\"name\":\"test-queue-iso\",\"maxDeliveryCount\":5,\"lockDuration\":\"PT2M\",\"requiresSession\":false,\"deadLetteringOnMessageExpiration\":false}";
        var contentIso = new StringContent(jsonWithIso, System.Text.Encoding.UTF8, "application/json");
        var isoResp = await _client.PostAsync("/api/connections/api-queue-lifecycle-conn/queues", contentIso);
        Assert.Equal(HttpStatusCode.Created, isoResp.StatusCode);

        // 5. Verify GetQueues contains newly created queues
        var queuesResp = await _client.GetAsync("/api/connections/api-queue-lifecycle-conn/queues");
        Assert.Equal(HttpStatusCode.OK, queuesResp.StatusCode);
        var queues = await queuesResp.Content.ReadFromJsonAsync<List<QueueSummary>>(_jsonOptions);
        Assert.NotNull(queues);
        Assert.Contains(queues, q => q.Name == "test-queue-num");
        Assert.Contains(queues, q => q.Name == "test-queue-str");
        Assert.Contains(queues, q => q.Name == "test-queue-iso");

        // 6. Delete queues
        var del1 = await _client.DeleteAsync("/api/connections/api-queue-lifecycle-conn/queues/test-queue-num");
        var del2 = await _client.DeleteAsync("/api/connections/api-queue-lifecycle-conn/queues/test-queue-str");
        var del3 = await _client.DeleteAsync("/api/connections/api-queue-lifecycle-conn/queues/test-queue-iso");
        Assert.Equal(HttpStatusCode.OK, del1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, del2.StatusCode);
        Assert.Equal(HttpStatusCode.OK, del3.StatusCode);

        // 7. Verify removed
        var afterQueuesResp = await _client.GetAsync("/api/connections/api-queue-lifecycle-conn/queues");
        var afterQueues = await afterQueuesResp.Content.ReadFromJsonAsync<List<QueueSummary>>(_jsonOptions);
        Assert.NotNull(afterQueues);
        Assert.DoesNotContain(afterQueues, q => q.Name == "test-queue-num");
    }

    [Fact]
    public async Task Topic_And_Subscription_Lifecycle_Works()
    {
        // 1. Ensure connection exists
        var createConn = new CreateConnectionRequest(
            Id: "api-topic-conn",
            Name: "API Topic Conn",
            Type: ConnectionType.LocalEmulator,
            ConnectionString: EmulatorConnStr,
            FullyQualifiedNamespace: "sbemulatorns"
        );
        await _client.PostAsJsonAsync("/api/connections", createConn, _jsonOptions);

        // 2. Create Topic
        var createTopic = new CreateTopicRequest("test-topic-lifecycle", 1024);
        var topicResp = await _client.PostAsJsonAsync("/api/connections/api-topic-conn/topics", createTopic, _jsonOptions);
        Assert.Equal(HttpStatusCode.Created, topicResp.StatusCode);

        // 3. Create Subscription on Topic
        var jsonSub = "{\"subscriptionName\":\"sub-1\",\"maxDeliveryCount\":10,\"lockDuration\":60,\"requiresSession\":false,\"deadLetteringOnMessageExpiration\":false}";
        var contentSub = new StringContent(jsonSub, System.Text.Encoding.UTF8, "application/json");
        var subResp = await _client.PostAsync("/api/connections/api-topic-conn/topics/test-topic-lifecycle/subscriptions", contentSub);
        Assert.Equal(HttpStatusCode.Created, subResp.StatusCode);

        // 4. Delete Subscription and Topic
        var delSub = await _client.DeleteAsync("/api/connections/api-topic-conn/topics/test-topic-lifecycle/subscriptions/sub-1");
        Assert.Equal(HttpStatusCode.OK, delSub.StatusCode);

        var delTopic = await _client.DeleteAsync("/api/connections/api-topic-conn/topics/test-topic-lifecycle");
        Assert.Equal(HttpStatusCode.OK, delTopic.StatusCode);
    }

    [Fact]
    public async Task Message_Send_And_Peek_Through_Api_Works()
    {
        // 1. Ensure connection exists
        var createRequest = new CreateConnectionRequest(
            Id: "api-msg-conn",
            Name: "API Message Conn",
            Type: ConnectionType.LocalEmulator,
            ConnectionString: EmulatorConnStr,
            FullyQualifiedNamespace: "sbemulatorns"
        );
        await _client.PostAsJsonAsync("/api/connections", createRequest, _jsonOptions);

        // 2. Send message via HTTP API
        string uniqueId = $"api-test-{Guid.NewGuid():N}";
        var sendPayload = new SendMessageRequest(
            Body: "{\"test\":\"via-http-api\",\"timestamp\":\"" + DateTime.UtcNow.ToString("o") + "\"}",
            Format: MessagePayloadFormat.Json,
            MessageId: uniqueId,
            Subject: "HttpApiTestMessage"
        );

        var sendResponse = await _client.PostAsJsonAsync("/api/connections/api-msg-conn/queues/normal-queue/messages/send", sendPayload, _jsonOptions);
        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sendResult = await sendResponse.Content.ReadFromJsonAsync<SendMessageResult>(_jsonOptions);
        Assert.NotNull(sendResult);
        Assert.True(sendResult.Success);
        Assert.Equal(uniqueId, sendResult.MessageId);

        // 3. Peek message via HTTP API
        var peekResponse = await _client.GetAsync("/api/connections/api-msg-conn/queues/normal-queue/messages?count=50");
        Assert.Equal(HttpStatusCode.OK, peekResponse.StatusCode);
        var messages = await peekResponse.Content.ReadFromJsonAsync<List<ServiceBusMessageDto>>(_jsonOptions);
        Assert.NotNull(messages);
        var found = messages.FirstOrDefault(m => m.MessageId == uniqueId);
        Assert.NotNull(found);
        Assert.Equal("HttpApiTestMessage", found.Subject);
        Assert.Equal(MessagePayloadFormat.Json, found.DetectedFormat);
    }
}
