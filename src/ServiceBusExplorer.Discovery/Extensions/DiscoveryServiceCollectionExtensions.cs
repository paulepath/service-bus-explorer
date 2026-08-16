using Microsoft.Extensions.DependencyInjection;
using ServiceBusExplorer.Core.Services;
using ServiceBusExplorer.Discovery.Providers;

namespace ServiceBusExplorer.Discovery.Extensions;

public static class DiscoveryServiceCollectionExtensions
{
    public static IServiceCollection AddDiscoveryServices(this IServiceCollection services)
    {
        services.AddSingleton<IDiscoveryProvider, WslDockerDiscoveryProvider>();
        services.AddSingleton<WslDockerDiscoveryProvider>();
        return services;
    }
}
