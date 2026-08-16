using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using ServiceBusExplorer.Api.Endpoints;
using ServiceBusExplorer.Core.Models;
using Xunit;

namespace ServiceBusExplorer.Api.Tests;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;
    private const string EmulatorConnStr = "Endpoint=sb://127.0.0.1:5673;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;";

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

        var addResponse = await _client.PostAsJsonAsync("/api/connections", createRequest);
        Assert.Equal(HttpStatusCode.Created, addResponse.StatusCode);

        // 3. Get connections
        var listResponse = await _client.GetAsync("/api/connections");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var connections = await listResponse.Content.ReadFromJsonAsync<List<ConnectionProfile>>();
        Assert.NotNull(connections);
        Assert.Contains(connections, c => c.Id == "api-test-conn");
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
        await _client.PostAsJsonAsync("/api/connections", createRequest);

        // 2. Send message via HTTP API
        string uniqueId = $"api-test-{Guid.NewGuid():N}";
        var sendPayload = new SendMessageRequest(
            Body: "{\"test\":\"via-http-api\",\"timestamp\":\"" + DateTime.UtcNow.ToString("o") + "\"}",
            Format: MessagePayloadFormat.Json,
            MessageId: uniqueId,
            Subject: "HttpApiTestMessage"
        );

        var sendResponse = await _client.PostAsJsonAsync("/api/connections/api-msg-conn/queues/normal-queue/messages/send", sendPayload);
        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sendResult = await sendResponse.Content.ReadFromJsonAsync<SendMessageResult>();
        Assert.NotNull(sendResult);
        Assert.True(sendResult.Success);
        Assert.Equal(uniqueId, sendResult.MessageId);

        // 3. Peek message via HTTP API
        var peekResponse = await _client.GetAsync("/api/connections/api-msg-conn/queues/normal-queue/messages?count=20");
        Assert.Equal(HttpStatusCode.OK, peekResponse.StatusCode);
        var messages = await peekResponse.Content.ReadFromJsonAsync<List<ServiceBusMessageDto>>();
        Assert.NotNull(messages);
        var found = messages.FirstOrDefault(m => m.MessageId == uniqueId);
        Assert.NotNull(found);
        Assert.Equal("HttpApiTestMessage", found.Subject);
        Assert.Equal(MessagePayloadFormat.Json, found.DetectedFormat);
    }
}
