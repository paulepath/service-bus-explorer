using System.Text;
using ServiceBusExplorer.AzureServiceBus.Converters;
using ServiceBusExplorer.Core.Models;
using Xunit;

namespace ServiceBusExplorer.Core.Tests;

public class MessageConverterTests
{
    [Fact]
    public void Detects_Json_Format_Correctly()
    {
        var bytes = Encoding.UTF8.GetBytes("{\"id\":123,\"name\":\"sample\"}");
        var (text, format) = MessageConverter.DetectFormatAndExtractText(bytes, "application/json");

        Assert.Equal(MessagePayloadFormat.Json, format);
        Assert.Equal("{\"id\":123,\"name\":\"sample\"}", text);
    }

    [Fact]
    public void Detects_Xml_Format_Correctly()
    {
        var bytes = Encoding.UTF8.GetBytes("<root><item id=\"1\">Value</item></root>");
        var (text, format) = MessageConverter.DetectFormatAndExtractText(bytes, "application/xml");

        Assert.Equal(MessagePayloadFormat.Xml, format);
        Assert.Equal("<root><item id=\"1\">Value</item></root>", text);
    }

    [Fact]
    public void Detects_PlainText_Format_Correctly()
    {
        var bytes = Encoding.UTF8.GetBytes("Hello Service Bus World!");
        var (text, format) = MessageConverter.DetectFormatAndExtractText(bytes, "text/plain");

        Assert.Equal(MessagePayloadFormat.PlainText, format);
        Assert.Equal("Hello Service Bus World!", text);
    }

    [Fact]
    public void Resolves_Emulator_Capabilities_Correctly()
    {
        var caps = CapabilityResolver.Resolve(ConnectionType.LocalEmulator, null);
        Assert.True(caps.HasFlag(ServiceBusCapabilities.PeekMessages));
        Assert.True(caps.HasFlag(ServiceBusCapabilities.SendMessages));
        Assert.True(caps.HasFlag(ServiceBusCapabilities.DeadLetterQueue));
        Assert.True(caps.HasFlag(ServiceBusCapabilities.ScheduleMessages));
    }
}
