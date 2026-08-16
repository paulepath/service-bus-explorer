using Microsoft.Extensions.DependencyInjection;
using ServiceBusExplorer.AzureServiceBus.Connection;
using ServiceBusExplorer.AzureServiceBus.Services;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.AzureServiceBus.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddAzureServiceBusInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IConnectionManager, InMemoryConnectionManager>();
        services.AddSingleton<IServiceBusClientCache, ServiceBusClientCache>();
        services.AddScoped<IServiceBusExplorerService, AzureServiceBusExplorerService>();
        services.AddScoped<IMessageOperationsService, AzureMessageOperationsService>();

        return services;
    }
}
