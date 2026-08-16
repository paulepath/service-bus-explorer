using System.Collections.Concurrent;
using Azure.Messaging.ServiceBus;
using Azure.Messaging.ServiceBus.Administration;
using ServiceBusExplorer.Core.Models;

namespace ServiceBusExplorer.AzureServiceBus.Connection;

public interface IServiceBusClientCache : IAsyncDisposable
{
    ServiceBusClient GetClient(ConnectionProfile profile);
    ServiceBusAdministrationClient? GetAdminClient(ConnectionProfile profile);
}

public sealed class ServiceBusClientCache : IServiceBusClientCache
{
    private readonly ConcurrentDictionary<string, ServiceBusClient> _clients = new();
    private readonly ConcurrentDictionary<string, ServiceBusAdministrationClient> _adminClients = new();

    public ServiceBusClient GetClient(ConnectionProfile profile)
    {
        return _clients.GetOrAdd(profile.Id, _ =>
        {
            if (string.IsNullOrWhiteSpace(profile.ConnectionString))
            {
                throw new InvalidOperationException($"Connection profile '{profile.Name}' does not have a connection string configured.");
            }

            var options = new ServiceBusClientOptions
            {
                TransportType = ServiceBusTransportType.AmqpTcp,
                RetryOptions = new ServiceBusRetryOptions
                {
                    Mode = ServiceBusRetryMode.Exponential,
                    MaxRetries = 3,
                    Delay = TimeSpan.FromMilliseconds(500),
                    MaxDelay = TimeSpan.FromSeconds(5)
                }
            };

            return new ServiceBusClient(profile.ConnectionString, options);
        });
    }

    public ServiceBusAdministrationClient? GetAdminClient(ConnectionProfile profile)
    {
        if (profile.Type == ConnectionType.LocalEmulator ||
            (profile.ConnectionString is not null && profile.ConnectionString.Contains("UseDevelopmentEmulator=true", StringComparison.OrdinalIgnoreCase)))
        {
            // Note: The Microsoft Service Bus Emulator typically does not expose the ARM / HTTP administration API endpoint
            // but if port 5300 or management is enabled or cloud namespace is used, we can construct the admin client.
            if (string.IsNullOrWhiteSpace(profile.ConnectionString)) return null;

            try
            {
                return _adminClients.GetOrAdd(profile.Id, _ => new ServiceBusAdministrationClient(profile.ConnectionString));
            }
            catch
            {
                return null;
            }
        }

        if (string.IsNullOrWhiteSpace(profile.ConnectionString))
            return null;

        return _adminClients.GetOrAdd(profile.Id, _ => new ServiceBusAdministrationClient(profile.ConnectionString));
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var client in _clients.Values)
        {
            await client.DisposeAsync();
        }
        _clients.Clear();
        _adminClients.Clear();
    }
}
