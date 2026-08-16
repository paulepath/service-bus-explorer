namespace ServiceBusExplorer.Discovery.Models;

public sealed record DiscoveredEmulator(
    string ContainerId,
    string ContainerName,
    string? Distro,
    string Image,
    string Status,
    int AmqpPort,
    int? ManagementPort,
    string ConnectionString,
    bool IsHealthy
);
