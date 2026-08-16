using System.Collections.Concurrent;
using ServiceBusExplorer.AzureServiceBus.Converters;
using ServiceBusExplorer.Core.Models;
using ServiceBusExplorer.Core.Services;

namespace ServiceBusExplorer.AzureServiceBus.Connection;

public sealed class InMemoryConnectionManager : IConnectionManager
{
    private readonly ConcurrentDictionary<string, ConnectionProfile> _connections = new();

    public Task<IReadOnlyList<ConnectionProfile>> GetAllConnectionsAsync(CancellationToken ct = default)
    {
        IReadOnlyList<ConnectionProfile> list = _connections.Values.ToList();
        return Task.FromResult(list);
    }

    public Task<ConnectionProfile?> GetConnectionAsync(string connectionId, CancellationToken ct = default)
    {
        _connections.TryGetValue(connectionId, out var profile);
        return Task.FromResult(profile);
    }

    public Task<ConnectionProfile> AddConnectionAsync(ConnectionProfile profile, CancellationToken ct = default)
    {
        var capabilities = CapabilityResolver.Resolve(profile.Type, profile.ConnectionString);
        var enriched = profile with { Capabilities = capabilities };
        _connections[enriched.Id] = enriched;
        return Task.FromResult(enriched);
    }

    public Task<bool> RemoveConnectionAsync(string connectionId, CancellationToken ct = default)
    {
        var removed = _connections.TryRemove(connectionId, out _);
        return Task.FromResult(removed);
    }

    public Task RegisterDiscoveredConnectionsAsync(IEnumerable<ConnectionProfile> profiles, CancellationToken ct = default)
    {
        foreach (var profile in profiles)
        {
            var capabilities = CapabilityResolver.Resolve(profile.Type, profile.ConnectionString);
            var enriched = profile with { Capabilities = capabilities, IsDiscovered = true };
            _connections[enriched.Id] = enriched;
        }
        return Task.CompletedTask;
    }
}
