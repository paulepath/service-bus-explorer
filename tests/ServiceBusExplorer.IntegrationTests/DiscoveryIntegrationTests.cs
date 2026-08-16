using Microsoft.Extensions.Logging.Abstractions;
using ServiceBusExplorer.Discovery.Providers;
using Xunit;

namespace ServiceBusExplorer.IntegrationTests;

public class DiscoveryIntegrationTests
{
    [Fact]
    public async Task Can_Discover_Running_Emulator_Containers_In_Wsl()
    {
        var provider = new WslDockerDiscoveryProvider(NullLogger<WslDockerDiscoveryProvider>.Instance);

        var discovered = await provider.DiscoverEmulatorsAsync();

        Assert.NotEmpty(discovered);
        var emulator = discovered.FirstOrDefault(e => e.ContainerName.Contains("sbe-test-emulator") || e.ContainerName.Contains("servicebus-emulator"));
        Assert.NotNull(emulator);
        Assert.True(emulator.AmqpPort > 0);
        Assert.Contains("Endpoint=sb://127.0.0.1:", emulator.ConnectionString);
    }
}
